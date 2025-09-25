const signalingSocket = new WebSocket("ws://localhost:8080");
//const signalingSocket = new WebSocket("ws://10.100.0.35:8080");
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

// WebRTC統計キーの英語化マッピング関数
function translateStatKey(key) {
  const translations = {
    // Connection state mappings
    'connection_state': 'connection_state',
    'ice_connection_state': 'ice_connection_state',
    'ice_gathering_state': 'ice_gathering_state',
    'signaling_state': 'signaling_state',

    // Inference related
    'inference_enabled': 'inference_enabled',
    'total_inferences': 'total_inferences',
    'skipped_frames_inference': 'skipped_frames_inference',
    'min_inference_interval_ms': 'min_inference_interval_ms',
    'detections_count': 'detections_count',
    'detections_person_count': 'detections_person_count',
    'max_confidence': 'max_confidence',
    'min_confidence': 'min_confidence',
    'avg_confidence': 'avg_confidence',
    'person_max_area': 'person_max_area',
    'person_min_area': 'person_min_area',
    'person_avg_area': 'person_avg_area',

    // Report info
    'report_types_count': 'report_types_count',
    'report_types': 'report_types',
    'total_reports': 'total_reports',

    // Codec stats
    'codec_payloadType': 'codec_payload_type',
    'codec_mimeType': 'codec_mime_type',
    'codec_clockRate': 'codec_clock_rate',
    'codec_channels': 'codec_channels',
    'codec_sdpFmtpLine': 'codec_sdp_fmtp_line',

    // Inbound RTP stats
    'inbound-rtp_packetsReceived': 'inbound_packets_received',
    'inbound-rtp_bytesReceived': 'inbound_bytes_received',
    'inbound-rtp_packetsLost': 'inbound_packets_lost',
    'inbound-rtp_jitter': 'inbound_jitter',
    'inbound-rtp_framesDecoded': 'inbound_frames_decoded',
    'inbound-rtp_keyFramesDecoded': 'inbound_key_frames_decoded',
    'inbound-rtp_frameWidth': 'inbound_frame_width',
    'inbound-rtp_frameHeight': 'inbound_frame_height',
    'inbound-rtp_framesPerSecond': 'inbound_frames_per_second',
    'inbound-rtp_qpSum': 'inbound_qp_sum',
    'inbound-rtp_totalDecodeTime': 'inbound_total_decode_time',
    'inbound-rtp_totalInterFrameDelay': 'inbound_total_inter_frame_delay',
    'inbound-rtp_audioLevel': 'inbound_audio_level',
    'inbound-rtp_totalAudioEnergy': 'inbound_total_audio_energy',
    'inbound-rtp_concealedSamples': 'inbound_concealed_samples',

    // Outbound RTP stats
    'outbound-rtp_packetsSent': 'outbound_packets_sent',
    'outbound-rtp_bytesSent': 'outbound_bytes_sent',
    'outbound-rtp_targetBitrate': 'outbound_target_bitrate',
    'outbound-rtp_framesEncoded': 'outbound_frames_encoded',
    'outbound-rtp_keyFramesEncoded': 'outbound_key_frames_encoded',
    'outbound-rtp_totalEncodeTime': 'outbound_total_encode_time',
    'outbound-rtp_totalPacketSendDelay': 'outbound_total_packet_send_delay',
    'outbound-rtp_qualityLimitationReason': 'outbound_quality_limitation_reason',
    'outbound-rtp_qualityLimitationDurations': 'outbound_quality_limitation_durations',
    'outbound-rtp_nackCount': 'outbound_nack_count',
    'outbound-rtp_firCount': 'outbound_fir_count',
    'outbound-rtp_pliCount': 'outbound_pli_count',
    'outbound-rtp_encoderImplementation': 'outbound_encoder_implementation',

    // Remote inbound RTP stats
    'remote-inbound-rtp_packetsLost': 'remote_inbound_packets_lost',
    'remote-inbound-rtp_jitter': 'remote_inbound_jitter',
    'remote-inbound-rtp_roundTripTime': 'remote_inbound_round_trip_time',
    'remote-inbound-rtp_totalRoundTripTime': 'remote_inbound_total_round_trip_time',
    'remote-inbound-rtp_fractionLost': 'remote_inbound_fraction_lost',

    // Remote outbound RTP stats
    'remote-outbound-rtp_packetsSent': 'remote_outbound_packets_sent',
    'remote-outbound-rtp_bytesSent': 'remote_outbound_bytes_sent',
    'remote-outbound-rtp_remoteTimestamp': 'remote_outbound_remote_timestamp',

    // Media source stats
    'media-source_trackIdentifier': 'media_source_track_identifier',
    'media-source_kind': 'media_source_kind',
    'media-source_audioLevel': 'media_source_audio_level',
    'media-source_totalAudioEnergy': 'media_source_total_audio_energy',
    'media-source_width': 'media_source_width',
    'media-source_height': 'media_source_height',
    'media-source_frames': 'media_source_frames',
    'media-source_framesPerSecond': 'media_source_frames_per_second',

    // CSRC stats
    'csrc_contributorSsrc': 'csrc_contributor_ssrc',
    'csrc_inboundRtpStreamId': 'csrc_inbound_rtp_stream_id',

    // Peer connection stats
    'peer-connection_dataChannelsOpened': 'peer_connection_data_channels_opened',
    'peer-connection_dataChannelsClosed': 'peer_connection_data_channels_closed',

    // Data channel stats
    'data-channel_label': 'data_channel_label',
    'data-channel_protocol': 'data_channel_protocol',
    'data-channel_dataChannelIdentifier': 'data_channel_identifier',
    'data-channel_state': 'data_channel_state',
    'data-channel_messagesSent': 'data_channel_messages_sent',
    'data-channel_bytesSent': 'data_channel_bytes_sent',
    'data-channel_messagesReceived': 'data_channel_messages_received',
    'data-channel_bytesReceived': 'data_channel_bytes_received',

    // Stream stats (deprecated)
    'stream_streamIdentifier': 'stream_identifier',
    'stream_trackIds': 'stream_track_ids',

    // Track stats (deprecated)
    'track_trackIdentifier': 'track_identifier',
    'track_remoteSource': 'track_remote_source',
    'track_ended': 'track_ended',

    // Transceiver stats
    'transceiver_senderId': 'transceiver_sender_id',
    'transceiver_receiverId': 'transceiver_receiver_id',
    'transceiver_mid': 'transceiver_media_id',

    // Sender stats
    'sender_mediaSourceId': 'sender_media_source_id',
    'sender_trackId': 'sender_track_id',

    // Receiver stats
    'receiver_trackId': 'receiver_track_id',
    'receiver_jitterBufferDelay': 'receiver_jitter_buffer_delay',
    'receiver_jitterBufferEmittedCount': 'receiver_jitter_buffer_emitted_count',

    // Transport stats
    'transport_bytesSent': 'transport_bytes_sent',
    'transport_bytesReceived': 'transport_bytes_received',
    'transport_dtlsState': 'transport_dtls_state',
    'transport_selectedCandidatePairId': 'transport_selected_candidate_pair_id',
    'transport_localCertificateId': 'transport_local_certificate_id',
    'transport_remoteCertificateId': 'transport_remote_certificate_id',
    'transport_tlsVersion': 'transport_tls_version',
    'transport_dtlsCipher': 'transport_dtls_cipher',
    'transport_iceRole': 'transport_ice_role',
    'transport_iceLocalUsernameFragment': 'transport_ice_local_username_fragment',
    'transport_iceState': 'transport_ice_state',

    // Candidate pair stats
    'candidate-pair_localCandidateId': 'candidate_pair_local_candidate_id',
    'candidate-pair_remoteCandidateId': 'candidate_pair_remote_candidate_id',
    'candidate-pair_state': 'candidate_pair_state',
    'candidate-pair_nominated': 'candidate_pair_nominated',
    'candidate-pair_bytesSent': 'candidate_pair_bytes_sent',
    'candidate-pair_bytesReceived': 'candidate_pair_bytes_received',
    'candidate-pair_lastPacketSentTimestamp': 'candidate_pair_last_packet_sent_timestamp',
    'candidate-pair_lastPacketReceivedTimestamp': 'candidate_pair_last_packet_received_timestamp',
    'candidate-pair_totalRoundTripTime': 'candidate_pair_total_round_trip_time',
    'candidate-pair_currentRoundTripTime': 'candidate_pair_current_round_trip_time',
    'candidate-pair_availableOutgoingBitrate': 'candidate_pair_available_outgoing_bitrate',
    'candidate-pair_requestsReceived': 'candidate_pair_requests_received',
    'candidate-pair_requestsSent': 'candidate_pair_requests_sent',
    'candidate-pair_responsesReceived': 'candidate_pair_responses_received',
    'candidate-pair_responsesSent': 'candidate_pair_responses_sent',
    'candidate-pair_consentRequestsSent': 'candidate_pair_consent_requests_sent',

    // Local/Remote candidate stats
    'local-candidate_transportId': 'local_candidate_transport_id',
    'local-candidate_address': 'local_candidate_address',
    'local-candidate_port': 'local_candidate_port',
    'local-candidate_protocol': 'local_candidate_protocol',
    'local-candidate_candidateType': 'local_candidate_type',
    'local-candidate_priority': 'local_candidate_priority',
    'local-candidate_url': 'local_candidate_url',
    'remote-candidate_transportId': 'remote_candidate_transport_id',
    'remote-candidate_address': 'remote_candidate_address',
    'remote-candidate_port': 'remote_candidate_port',
    'remote-candidate_protocol': 'remote_candidate_protocol',
    'remote-candidate_candidateType': 'remote_candidate_type',
    'remote-candidate_priority': 'remote_candidate_priority',
    'remote-candidate_url': 'remote_candidate_url',

    // Certificate stats
    'certificate_fingerprint': 'certificate_fingerprint',
    'certificate_fingerprintAlgorithm': 'certificate_fingerprint_algorithm',
    'certificate_base64Certificate': 'certificate_base64_certificate',
  };

  // フォールバック処理: マッピングされていないキーを小文字のスネークケースに変換
  if (translations[key]) {
    return translations[key];
  }

  // キーが空の場合は'unknown_field'を返す
  if (!key || key.trim() === '') {
    return 'unknown_field';
  }

  // キャメルケースをスネークケースに変換し、すべて小文字にする
  return key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}


// Answer側用統計保存機能
function saveAnswerWebRTCStats() {
  console.log("=== Answer側WebRTC統計保存機能デバッグ ===");
  console.log("ボタンクリック検知: OK");
  console.log("webrtcStatsLogs配列長:", webrtcStatsLogs.length);
  console.log("peerConnection状態:", peerConnection ? peerConnection.connectionState : "未接続");
  console.log("stream状態:", stream ? "取得済み" : "未取得");
  console.log("統計スキーマ: Answer側全WebRTCStats対応");

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const pad = n => n.toString().padStart(2, "0");
  const ts = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}_${pad(jst.getUTCHours())}-${pad(jst.getUTCMinutes())}-${pad(jst.getUTCSeconds())}`;

  if (webrtcStatsLogs.length > 0) {
    console.log("統計データ有り - CSV作成開始");
    console.log("統計項目数:", Object.keys(webrtcStatsLogs[0]).length);
    console.log("利用可能なレポートタイプ:", webrtcStatsLogs[0].report_types);

    const headers = Object.keys(webrtcStatsLogs[0]);

    // デバッグ情報: 空のヘッダーや問題のあるヘッダーをチェック
    const emptyHeaders = headers.filter(h => !h || h.trim() === '');
    const suspiciousHeaders = headers.filter(h => h.includes('undefined') || h.includes('null'));

    if (emptyHeaders.length > 0) {
      console.warn('Empty headers found:', emptyHeaders);
    }
    if (suspiciousHeaders.length > 0) {
      console.warn('Suspicious headers found:', suspiciousHeaders);
    }

    console.log('Sample headers:', headers.slice(0, 10));
    console.log('Total headers:', headers.length);

    const csv = [
      headers.join(","),
      ...webrtcStatsLogs.map(row => headers.map(h => {
        const value = row[h];
        // 値がundefinedやnullの場合は空文字、オブジェクトの場合はJSON文字列に変換
        if (value === undefined || value === null) return "";
        if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
        return String(value).replace(/"/g, '""');
      }).join(","))
    ].join("\n");

    console.log("CSV作成完了 - ダウンロード開始");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `answer_webrtc_stats_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log(`✅ Answer側WebRTC統計を保存: ${webrtcStatsLogs.length}エントリ (${ts})`);
    alert(`Answer側統計データを保存しました (${webrtcStatsLogs.length}エントリ、${headers.length}項目)`);
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

setInterval(async function collectCompleteAnswerWebRTCStats() {
  if (!peerConnection) return;
  const stats = await peerConnection.getStats();

  // 全statsを格納するオブジェクト
  const allStats = {};

  // 全てのstatsレポートを収集
  stats.forEach((report) => {
    // reportのtypeとkindを組み合わせてキーを作成
    const key = report.kind ? `${report.type}_${report.kind}` : report.type;

    if (!allStats[key]) {
      allStats[key] = [];
    }
    allStats[key].push(report);
  });

  // 基本情報を含むログエントリ（英語項目名）
  const logEntry = {
    timestamp: new Date().toISOString(),
    side: 'answer',
    [translateStatKey('connection_state')]: peerConnection.connectionState,
    [translateStatKey('ice_connection_state')]: peerConnection.iceConnectionState,
    [translateStatKey('ice_gathering_state')]: peerConnection.iceGatheringState,
    [translateStatKey('signaling_state')]: peerConnection.signalingState
  };

  // 全てのstatsタイプを処理
  stats.forEach((report) => {
    const prefix = report.kind ? `${report.type}_${report.kind}` : report.type;

    // 基本的なレポート情報を保存
    Object.keys(report).forEach(key => {
      if (key !== 'type' && key !== 'kind' && key !== 'id' && key !== 'timestamp') {
        const originalKey = `${prefix}_${key}`;
        const translatedKey = translateStatKey(originalKey);
        logEntry[translatedKey] = report[key];
      }
    });
  });

  // レポートタイプの数と概要を追加（英語変換付き）
  const reportTypes = Array.from(stats.values()).map(r => r.type);
  const uniqueTypes = [...new Set(reportTypes)];
  logEntry[translateStatKey('report_types_count')] = uniqueTypes.length;
  logEntry[translateStatKey('report_types')] = uniqueTypes.join('|');
  logEntry[translateStatKey('total_reports')] = reportTypes.length;

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
