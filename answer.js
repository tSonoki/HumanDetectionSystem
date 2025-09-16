
const signalingSocket = new WebSocket("ws://localhost:8080");
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
    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:10.100.0.35:3478" }],
    });

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: payload.sdp })
    );

    stream.getTracks().forEach((track) => {
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

    while (iceCandidateQueue.length > 0) {
      const candidate = iceCandidateQueue.shift();
      await peerConnection.addIceCandidate(candidate);
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    signalingSocket.send(
      JSON.stringify({ type: "answer", payload: { sdp: answer.sdp } })
    );
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
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: Number(document.getElementById("video-width").value),
      height: Number(document.getElementById("video-height").value),
      frameRate: Number(document.getElementById("video-rate").value),
      deviceId: String(deviceId),
    },
  });
  const videoElement = document.getElementById("local-video");
  videoElement.srcObject = stream;

});

// ===== ここから詳細WebRTC統計ログ機能 (Answer側) =====
const webrtcStatsLogs = [];

// 統一されたログスキーマを作成する関数（Answer側版）
function createUnifiedLogEntry() {
  const now = new Date();
  const isoTimestamp = now.toISOString();
  
  return {
    // 基本情報（共通）
    timestamp: isoTimestamp,
    time_formatted: now.toLocaleTimeString('ja-JP'),
    side: 'answer',
    session_id: peerConnection ? peerConnection._sessionId || 'unknown' : 'no_connection',
    
    // 接続状態（共通）
    connection_state: peerConnection ? peerConnection.connectionState : 'unknown',
    ice_connection_state: peerConnection ? peerConnection.iceConnectionState : 'unknown',
    ice_gathering_state: peerConnection ? peerConnection.iceGatheringState : 'unknown',
    
    // アプリケーション状態（共通）
    inference_enabled: isInferenceEnabled,
    canvas_visible: isCanvasVisible,
    
    // Video品質（Answer側：送信統計）
    frame_width: 0,
    frame_height: 0,
    frames_per_second: 0,
    frames_received: 0, // Offer側で使用
    frames_decoded: 0, // Offer側で使用
    frames_dropped: 0, // Offer側で使用
    frames_sent: 0,
    frames_encoded: 0,
    key_frames_decoded: 0, // Offer側で使用
    key_frames_encoded: 0,
    
    // 品質メトリクス
    actual_fps_received: 0, // Offer側で使用
    actual_fps_decoded: 0, // Offer側で使用
    actual_fps_sent: 0,
    actual_fps_encoded: 0,
    avg_decode_time_ms: 0, // Offer側で使用
    avg_encode_time_ms: 0,
    total_decode_time_ms: 0, // Offer側で使用
    total_encode_time_ms: 0,
    
    // ジッターバッファ（主にOffer側）
    jitter_buffer_delay_ms: 0,
    jitter_buffer_emitted_count: 0,
    avg_jitter_buffer_delay_ms: 0,
    
    // ネットワーク統計（共通）
    jitter_ms: 0,
    rtt_ms: 0,
    packets_received: 0, // Offer側で使用
    packets_sent: 0,
    packets_lost: 0,
    bytes_received: 0, // Offer側で使用
    bytes_sent: 0,
    header_bytes_received: 0, // Offer側で使用
    packets_per_second: 0,
    bitrate_kbps: 0,
    target_bitrate: 0,
    available_outgoing_bitrate: 0,
    
    // エラー統計（共通）
    fir_count: 0,
    pli_count: 0,
    nack_count: 0,
    retransmitted_packets_sent: 0,
    retransmitted_bytes_sent: 0,
    
    
    // 検出結果統計（共通）
    detections_count: 0,
    detections_person_count: 0,
    max_confidence: 0,
    avg_confidence: 0
  };
}

// Answer側用統計保存機能
function saveAnswerWebRTCStats() {
  console.log("=== Answer側統計保存機能デバッグ ===");
  console.log("ボタンクリック検知: OK");
  console.log("webrtcStatsLogs配列長:", webrtcStatsLogs.length);
  console.log("peerConnection状態:", peerConnection ? peerConnection.connectionState : "未接続");
  console.log("stream状態:", stream ? "取得済み" : "未取得");

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

setInterval(async function debugRTCStats() {
  if (!peerConnection) return;
  const stats = await peerConnection.getStats();

  let logRow = {
    timestamp: new Date().toLocaleTimeString('ja-JP'),
    roundTripTime: null,
    targetBitrate: null, // targetBitrate を追加
    totalPacketSendDelay: null,
    '[totalPacketSendDelay/packetsSent_in_ms]': null,
    totalEncodeTime: null,
    '[totalEncodeTime/framesEncoded_in_ms]': null,
    packetsSent: null,
    bytesSent: null,
    framesEncoded: null,
    '[framesEncoded/s]': null,
    frameWidth: null,
    frameHeight: null,
    framesPerSecond: null,
  };

  let prevFramesEncoded = null;
  let prevTimestamp = null;

  stats.forEach((report) => {
    if (report.type === "candidate-pair" && report.state === "succeeded") {
      logRow.roundTripTime = report.currentRoundTripTime ?? report.roundTripTime ?? null;
    }

    if (report.type === "outbound-rtp" && report.kind === "video") {
      logRow.targetBitrate = report.targetBitrate ?? null; // targetBitrate を取得
      logRow.packetsSent = report.packetsSent ?? null;
      logRow.bytesSent = report.bytesSent ?? null;
      logRow.totalEncodeTime = report.totalEncodeTime ?? null;
      logRow.framesEncoded = report.framesEncoded ?? null;
      logRow.totalPacketSendDelay = report.totalPacketSendDelay ?? null;

      if (report.totalEncodeTime !== undefined && report.framesEncoded > 0) {
        logRow['[totalEncodeTime/framesEncoded_in_ms]'] =
          ((report.totalEncodeTime / report.framesEncoded) * 1000).toFixed(3);
      }

      if (report.totalPacketSendDelay !== undefined && report.packetsSent > 0) {
        logRow['[totalPacketSendDelay/packetsSent_in_ms]'] =
          ((report.totalPacketSendDelay / report.packetsSent) * 1000).toFixed(6);
      }

      // framesEncoded/s の計算
      if (prevFramesEncoded !== null && prevTimestamp !== null && report.framesEncoded) {
        const timeDiff = (report.timestamp - prevTimestamp) / 1000; // in seconds
        const frameDiff = report.framesEncoded - prevFramesEncoded;
        if (timeDiff > 0) {
            logRow['[framesEncoded/s]'] = (frameDiff / timeDiff).toFixed(2);
        }
      }
      prevFramesEncoded = report.framesEncoded;
      prevTimestamp = report.timestamp;
    }

    if (report.type === "media-source" && report.kind === "video") {
      logRow.frameWidth = report.width ?? logRow.frameWidth;
      logRow.frameHeight = report.height ?? logRow.frameHeight;
      logRow.framesPerSecond = report.framesPerSecond ?? logRow.framesPerSecond;
    }
  });

  // 統一スキーマでログエントリを作成
  let logEntry = createUnifiedLogEntry();
  

  // 既存のログデータを統一スキーマにマッピング
  logEntry.target_bitrate = logRow.targetBitrate || 0;
  logEntry.packets_sent = logRow.packetsSent || 0;
  logEntry.bytes_sent = logRow.bytesSent || 0;
  logEntry.total_encode_time_ms = logRow.totalEncodeTime ? 
    parseFloat((logRow.totalEncodeTime * 1000).toFixed(3)) : 0;  
  logEntry.frames_encoded = logRow.framesEncoded || 0;
  logEntry.rtt_ms = logRow.roundTripTime ? 
    parseFloat((logRow.roundTripTime * 1000).toFixed(3)) : 0;
  logEntry.avg_encode_time_ms = logRow['[totalEncodeTime/framesEncoded_in_ms]'] ? 
    parseFloat(logRow['[totalEncodeTime/framesEncoded_in_ms]']) : 0;
  logEntry.actual_fps_encoded = logRow['[framesEncoded/s]'] ? 
    parseFloat(logRow['[framesEncoded/s]']) : 0;
  logEntry.frame_width = logRow.frameWidth || 0;
  logEntry.frame_height = logRow.frameHeight || 0;
  logEntry.frames_per_second = logRow.framesPerSecond || 0;
  
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
