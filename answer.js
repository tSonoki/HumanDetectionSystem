//const signalingSocket = new WebSocket("ws://localhost:8080");
const signalingSocket = new WebSocket("ws://10.100.0.35:8080");
const autorunSocket = new WebSocket("ws://127.0.0.1:8081");
let peerConnection;
let remoteDataChannel = null;
let iceCandidateQueue = []; // リモートSDP設定前のICE候補を保存するキュー
let stream = null;
const streamCaptureBtn = document.getElementById("stream-capture");
const cameraSelect = document.getElementById("camera-select");




// 安全システム処理関数
function handleEmergencyStop(data) {
  console.warn('🚨 EMERGENCY STOP RECEIVED:', data);

  // トラクタ制御システムに停止信号を送信
  if (autorunSocket && autorunSocket.readyState === WebSocket.OPEN) {
    const emergencyStopCommand = {
      type: "emergency_stop",
      timestamp: data.timestamp,
      reason: data.reason,
      action: "immediate_stop"
    };

    try {
      autorunSocket.send(JSON.stringify(emergencyStopCommand));
      console.log('Emergency stop command sent to tractor control system');
    } catch (error) {
      console.error('Failed to send emergency stop to tractor:', error);
    }
  } else {
    console.error('Tractor control connection not available');
  }

  // ローカルUIも更新
  showEmergencyAlert("人を検知しました！トラクタを緊急停止します。");
}

function handleWarningLight(data) {
  console.log(`Warning light ${data.action}:`, data);

  // パトライト制御システムに信号を送信
  if (autorunSocket && autorunSocket.readyState === WebSocket.OPEN) {
    const warningLightCommand = {
      type: "warning_light_control",
      action: data.action, // "on" or "off"
      timestamp: data.timestamp,
      pattern: "emergency" // 点滅パターン
    };

    try {
      autorunSocket.send(JSON.stringify(warningLightCommand));
      console.log(`Warning light ${data.action} command sent`);
    } catch (error) {
      console.error('Failed to send warning light command:', error);
    }
  }

  // ローカルUIも更新
  updateWarningLightStatus(data.action === "on");
}

function showEmergencyAlert(message) {
  // 緊急アラートをブラウザに表示
  const alertDiv = document.createElement('div');
  alertDiv.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #ff0000;
    color: white;
    padding: 20px;
    border-radius: 10px;
    z-index: 9999;
    font-size: 18px;
    font-weight: bold;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    animation: pulse 1s infinite;
  `;
  alertDiv.textContent = message;
  
  document.body.appendChild(alertDiv);
  
  // 10秒後に自動削除
  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.parentNode.removeChild(alertDiv);
    }
  }, 10000);
}

function updateWarningLightStatus(isOn) {
  const statusElement = document.getElementById("warning-light-status");
  if (statusElement) {
    statusElement.textContent = `パトライト: ${isOn ? "点灯中" : "消灯"}`;
    statusElement.className = isOn ? "warning-on" : "warning-off";
  }
}

function handleDetectionData(data) {
  console.log('Received detection data from offer side:', data);
  
  // Offer側からの検出データを処理
  // 自動リセット機能のために人の検出数を監視
  const personCount = data.c || 0; // count
  const timestamp = data.ts || Date.now();
  
  // Answer側では検出データを受信するのみで、推論は行わない
  console.log(`Received detection from offer side: ${personCount} persons detected at ${timestamp}`);
}



let mr1000aReceiveInfo = {
  lat: 0,
  lon: 0,
  gnssQuality: 0,
  gnssSpeed: 0,
  heading: 0,
  headingError: 0,
  lateralError: 0,
  steerAngle: 0,
  realSteerAngle: 0,
  stopStatus: 0,
};


signalingSocket.onmessage = async (event) => {
  const { type, payload } = JSON.parse(event.data);

  if (type === "offer") {
    console.log("ANSWER: Received offer, creating PeerConnection");

    peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:10.100.0.35:3478" }
      ],
    });

    // 接続状態の監視
    peerConnection.onconnectionstatechange = () => {
      console.log("ANSWER: PeerConnection state:", peerConnection.connectionState);
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log("ANSWER: ICE connection state:", peerConnection.iceConnectionState);
    };

    peerConnection.onicegatheringstatechange = () => {
      console.log("ANSWER: ICE gathering state:", peerConnection.iceGatheringState);
    };

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: payload.sdp })
    );

    console.log("ANSWER: Remote description set successfully");

    // ストリームが存在するかチェック
    if (!stream) {
      console.error("ANSWER: No stream available! Please click 'Get Capture' first.");
      alert("カメラストリームが取得されていません。先に'Get Capture'ボタンをクリックしてください。");
      return;
    }

    console.log("ANSWER: Adding tracks to peer connection");
    stream.getTracks().forEach((track, index) => {
      console.log(`ANSWER: Adding track ${index}:`, track);
      peerConnection.addTrack(track, stream);
    });

    peerConnection.ondatachannel = (event) => {
      remoteDataChannel = event.channel;

      remoteDataChannel.onopen = () => {
        console.log("DataChannel is open");
        setInterval(() => {
          if (remoteDataChannel != null) {
            remoteDataChannel.send(
              JSON.stringify({
                type: "outputAutorunInfo",
                payload: mr1000aReceiveInfo,
              })
            );
          }
        }, 33); // 約30Hz
      };

      remoteDataChannel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "inputAutorunInfo":
            if (autorunSocket != null) {
              const remoteDrivingData = data;
              autorunSocket.send(
                JSON.stringify({
                  type: "inputAutorunInfo",
                  payload: { inputInfo: remoteDrivingData },
                })
              );
            }
            break;
          case "emergency_stop":
            handleEmergencyStop(data);
            break;
          case "warning_light":
            handleWarningLight(data);
            break;
          case "offer_detect":
            // Offer側からの検知結果（コンパクト形式）
            handleDetectionData(data);
            break;
          case "videoQualityChange":
            console.log("Received video quality change request:", data.payload); // 受信ログを追加
            const videoSender = peerConnection.getSenders().find(
              (sender) => sender.track && sender.track.kind === "video"
            );
            if (videoSender) {
              const params = videoSender.getParameters();
              if (params.encodings && params.encodings.length > 0) {
                // data.payload.bitrate を参照するように修正
                params.encodings[0].maxBitrate = data.payload.bitrate;
                videoSender.setParameters(params)
                  .then(() => {
                    console.log(`Video bitrate successfully changed to: ${data.payload.bitrate}`);
                  })
                  .catch(e => {
                    console.error("Failed to set video bitrate:", e);
                  });
              }
            }
            break;
          case "offerInferenceResults":
            console.log(
              "Received inference results from offer side:",
              data.payload
            );
            break;
        }
      };
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        signalingSocket.send(
          JSON.stringify({
            type: "ice-answer",
            payload: { candidate: event.candidate },
          })
        );
      }
    };

    console.log("ANSWER: Processing queued ICE candidates:", iceCandidateQueue.length);
    while (iceCandidateQueue.length > 0) {
      const candidate = iceCandidateQueue.shift();
      await peerConnection.addIceCandidate(candidate);
    }

    console.log("ANSWER: Creating answer...");
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    console.log("ANSWER: Sending answer to signaling server");
    signalingSocket.send(
      JSON.stringify({ type: "answer", payload: { sdp: answer.sdp } })
    );
    console.log("ANSWER: Answer sent successfully");
  } else if (type === "ice-offer") {
    const candidate = new RTCIceCandidate(payload.candidate);

    if (peerConnection && peerConnection.remoteDescription) {
      await peerConnection.addIceCandidate(candidate);
    } else {
      iceCandidateQueue.push(candidate);
    }
  }
};

signalingSocket.onopen = () => {
  signalingSocket.send(
    JSON.stringify({ type: "register-answer", payload: { id: "answer" } })
  );
};

autorunSocket.onopen = () => {
  autorunSocket.send(JSON.stringify({ type: "remote-control" }));
};

autorunSocket.onmessage = (event) => {
  const nodeData = JSON.parse(event.data);
  if (nodeData.type === "autorun-output-data") {
    const { outputAutorunInfo } = nodeData.payload;
    mr1000aReceiveInfo = outputAutorunInfo;
  }
};

function populateCameras() {
  if (!("mediaDevices" in navigator)) return;
  navigator.mediaDevices.enumerateDevices().then((mediaDevices) => {
    while (cameraSelect.options.length > 0) {
      cameraSelect.remove(0);
    }
    const defaultOption = document.createElement("option");
    defaultOption.id = "default";
    defaultOption.textContent = "Default Camera";
    cameraSelect.appendChild(defaultOption);

    const videoInputDevices = mediaDevices.filter(
      (mediaDevice) => mediaDevice.kind === "videoinput"
    );
    if (videoInputDevices.length > 0) {
      cameraSelect.disabled = false;
    }
    videoInputDevices.forEach((videoInputDevice, index) => {
      if (!videoInputDevice.deviceId) {
        return;
      }
      const option = document.createElement("option");
      option.id = videoInputDevice.deviceId;
      option.textContent = videoInputDevice.label || `Camera ${index + 1}`;
      option.selected = deviceId == option.id;
      cameraSelect.appendChild(option);
    });
  });
}

window.addEventListener("DOMContentLoaded", populateCameras);
if ("mediaDevices" in navigator) {
  navigator.mediaDevices.addEventListener("devicechange", populateCameras);
}

let deviceId = "default";
// Answer側用の状態変数を追加
let isInferenceEnabled = false; // Answer側では推論機能なし
let isCanvasVisible = false; // Answer側ではキャンバス機能なし

cameraSelect.onchange = (_) => {
  deviceId = cameraSelect.selectedOptions[0].id;
};

streamCaptureBtn.addEventListener("click", async () => {
  try {
    console.log("ANSWER: Attempting to get camera with deviceId:", deviceId);

    // カメラ制約を作成
    const videoConstraints = {
      width: Number(document.getElementById("video-width").value),
      height: Number(document.getElementById("video-height").value),
      frameRate: Number(document.getElementById("video-rate").value),
    };

    // deviceIdが"default"でない場合のみ指定
    if (deviceId !== "default") {
      videoConstraints.deviceId = { exact: deviceId };
    }

    console.log("ANSWER: Video constraints:", videoConstraints);

    stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
    });

    const videoElement = document.getElementById("local-video");
    videoElement.srcObject = stream;

    // ビデオ要素の再生を明示的に開始
    try {
      await videoElement.play();
      console.log("ANSWER: Video element started playing");
    } catch (playError) {
      console.warn("ANSWER: Video play failed:", playError);
    }

    // Debug: Check stream status
    console.log("ANSWER: Stream obtained:", stream);
    console.log("ANSWER: Stream active:", stream.active);
    console.log("ANSWER: Video tracks:", stream.getVideoTracks());
    stream.getVideoTracks().forEach((track, index) => {
      console.log(`ANSWER: Video track ${index}:`, track);
      console.log(`ANSWER: Track ${index} readyState:`, track.readyState);
      console.log(`ANSWER: Track ${index} enabled:`, track.enabled);
      console.log(`ANSWER: Track ${index} settings:`, track.getSettings());
    });

    // ストリーム取得成功をUIに反映
    streamCaptureBtn.textContent = "Camera Active";
    streamCaptureBtn.style.backgroundColor = "#28a745";

  } catch (error) {
    console.error("ANSWER: Failed to get camera:", error);
    console.error("ANSWER: Error details:", error.name, error.message);

    // エラーをUIに反映
    streamCaptureBtn.textContent = "Camera Error";
    streamCaptureBtn.style.backgroundColor = "#dc3545";

    // より詳細なエラーメッセージを表示
    if (error.name === "NotFoundError") {
      alert("カメラが見つかりません。接続を確認してください。");
    } else if (error.name === "NotAllowedError") {
      alert("カメラアクセスが許可されていません。ブラウザの設定を確認してください。");
    } else if (error.name === "OverconstrainedError") {
      alert("指定されたカメラ設定がサポートされていません。設定を変更してください。");
    } else {
      alert(`カメラエラー: ${error.message}`);
    }
  }
});

// ===== ここから詳細WebRTC統計ログ機能 (Answer側) =====
const webrtcStatsLogs = [];

// Answer側専用最適化ログスキーマ（送信・エンコード中心）
function createOptimizedAnswerLogEntry() {
  const now = new Date();
  const logEntry = {
    // === 基本情報 ===
    timestamp: now.toISOString(),
    side: 'answer',

    // === 接続状態 ===
    connection_state: peerConnection ? peerConnection.connectionState : 'unknown',
    ice_connection_state: peerConnection ? peerConnection.iceConnectionState : 'unknown',

    // === 映像品質（送信・エンコード統計）===
    frame_width: 0,
    frame_height: 0,
    frames_per_second: 0,
    frames_sent: 0,
    frames_encoded: 0,
    key_frames_encoded: 0,

    // === 実際のパフォーマンス ===
    actual_fps_sent: 0,
    actual_fps_encoded: 0,
    total_encode_time_ms: 0, // avg_encode_time_msは計算で求める

    // === ネットワーク統計（送信系）===
    rtt_ms: 0,
    packets_sent: 0,
    bytes_sent: 0,
    target_bitrate: 0,
    available_outgoing_bitrate: 0
  };

  // === 条件分岐: エラー統計（エラー発生時のみ）===
  // 実際のエラー検出ロジックは統計収集部分で設定

  // === Answer側では推論機能なし ===
  logEntry.inference_enabled = false;

  return logEntry;
}

// Answer側用統計保存機能
function saveAnswerWebRTCStats() {
  console.log("=== 最適化Answer側統計保存機能デバッグ ===");
  console.log("ボタンクリック検知: OK");
  console.log("webrtcStatsLogs配列長:", webrtcStatsLogs.length);
  console.log("peerConnection状態:", peerConnection ? peerConnection.connectionState : "未接続");
  console.log("stream状態:", stream ? "取得済み" : "未取得");
  console.log("最適化スキーマ: Answer側専用（送信・エンコード中心）");

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const pad = n => n.toString().padStart(2, "0");
  const ts = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}_${pad(jst.getUTCHours())}-${pad(jst.getUTCMinutes())}-${pad(jst.getUTCSeconds())}`;

  if (webrtcStatsLogs.length > 0) {
    console.log("統計データ有り - CSV作成開始");
    const headers = Object.keys(webrtcStatsLogs[0]);
    const csv = [
      headers.join(","),
      ...webrtcStatsLogs.map(row => headers.map(h => row[h] ?? "").join(","))
    ].join("\n");

    console.log("CSV作成完了 - ダウンロード開始");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `answer_webrtc_unified_stats_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log(`✅ Answer側統一WebRTC統計を保存: ${webrtcStatsLogs.length}エントリ (${ts})`);
    alert(`Answer側統計データを保存しました (${webrtcStatsLogs.length}エントリ)`);
  } else {
    console.warn("❌ 保存する統計データがありません");
    console.log("WebRTC接続とカメラストリームを確立してからお試しください");
    console.log("手順: 1) Get Capture でカメラ取得 2) Offer側から Send SDP");
    alert("保存する統計データがありません。\n1) Get Captureでカメラを取得\n2) Offer側からSend SDPでWebRTC接続\nを行ってからお試しください。");
  }
}

function clearAnswerWebRTCStats() {
  const previousLength = webrtcStatsLogs.length;
  webrtcStatsLogs.length = 0;
  console.log(`✅ Answer側WebRTC統計データをクリアしました (${previousLength}エントリ削除)`);
  alert(`統計データをクリアしました (${previousLength}エントリ削除)`);
}

setInterval(async function collectOptimizedAnswerWebRTCStats() {
  if (!peerConnection) return;
  const stats = await peerConnection.getStats();

  // 最適化されたAnswer側スキーマでログエントリを作成
  let logEntry = createOptimizedAnswerLogEntry();

  let outboundRtpReport, candidatePairReport, mediaSourceReport;

  stats.forEach((report) => {
    if (report.type === "candidate-pair" && report.state === "succeeded") {
      candidatePairReport = report;
    } else if (report.type === "outbound-rtp" && report.kind === "video") {
      outboundRtpReport = report;
    } else if (report.type === "media-source" && report.kind === "video") {
      mediaSourceReport = report;
    }
  });

  // === 送信・エンコード統計 ===
  if (outboundRtpReport) {
    logEntry.frames_sent = outboundRtpReport.framesSent || 0;
    logEntry.frames_encoded = outboundRtpReport.framesEncoded || 0;
    logEntry.key_frames_encoded = outboundRtpReport.keyFramesEncoded || 0;
    logEntry.total_encode_time_ms = outboundRtpReport.totalEncodeTime ?
      parseFloat((outboundRtpReport.totalEncodeTime * 1000).toFixed(3)) : 0;

    // ネットワーク統計
    logEntry.packets_sent = outboundRtpReport.packetsSent || 0;
    logEntry.bytes_sent = outboundRtpReport.bytesSent || 0;
    logEntry.target_bitrate = outboundRtpReport.targetBitrate || 0;

    // === エラー統計（エラー発生時のみ追加）===
    const retransmittedPackets = outboundRtpReport.retransmittedPacketsSent || 0;
    const retransmittedBytes = outboundRtpReport.retransmittedBytesSent || 0;
    const firCount = outboundRtpReport.firCount || 0;
    const pliCount = outboundRtpReport.pliCount || 0;
    const nackCount = outboundRtpReport.nackCount || 0;

    if (retransmittedPackets > 0 || retransmittedBytes > 0 || firCount > 0 || pliCount > 0 || nackCount > 0) {
      if (retransmittedPackets > 0) logEntry.retransmitted_packets_sent = retransmittedPackets;
      if (retransmittedBytes > 0) logEntry.retransmitted_bytes_sent = retransmittedBytes;
      if (firCount > 0) logEntry.fir_count = firCount;
      if (pliCount > 0) logEntry.pli_count = pliCount;
      if (nackCount > 0) logEntry.nack_count = nackCount;
    }
  }

  // === RTT情報 ===
  if (candidatePairReport) {
    logEntry.rtt_ms = candidatePairReport.currentRoundTripTime ?
      parseFloat((candidatePairReport.currentRoundTripTime * 1000).toFixed(3)) : 0;
    logEntry.available_outgoing_bitrate = candidatePairReport.availableOutgoingBitrate || 0;
  }

  // === メディアソース情報 ===
  if (mediaSourceReport) {
    logEntry.frame_width = mediaSourceReport.width || 0;
    logEntry.frame_height = mediaSourceReport.height || 0;
    logEntry.frames_per_second = mediaSourceReport.framesPerSecond || 0;
  }

  // 統一ログに保存
  webrtcStatsLogs.push(logEntry);

  // メモリ使用量制限
  if (webrtcStatsLogs.length > 1000) {
    webrtcStatsLogs.splice(0, webrtcStatsLogs.length - 1000);
  }
}, 1000);

// CSV保存
function saveDelayLogsAsCSV() {
  if (delayLogs.length === 0) return;

  const headers = Object.keys(delayLogs[0]);
  const csvContent = [
    headers.join(","),
    ...delayLogs.map(log => headers.map(h => log[h] ?? "").join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // 日本時間 (JST) に変換
  const pad = n => n.toString().padStart(2, "0");
  const ts = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}_${pad(jst.getUTCHours())}-${pad(jst.getUTCMinutes())}-${pad(jst.getUTCSeconds())}`;

  a.download = `answer_webrtc_delay_log_${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("save-delay-log").addEventListener("click", saveAnswerWebRTCStats);
document.getElementById("clear-stats").addEventListener("click", clearAnswerWebRTCStats);
// ===== 遅延ログ機能ここまで =====
