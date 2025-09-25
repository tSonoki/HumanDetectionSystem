//This repository is develoveped for virtual tractor project.

import {
  prioritizeSelectedVideoCodec,
  // setVideoQuality, // 外部ファイルからのインポートを削除
} from "./webrtcFunction.js";
import {
  onGamepadConnected,
  onGamepadDisconnected,
  getOrderedGamepads,
} from "./gamepad.js";
import {
  gamepadToAutorunInfo,
  drawGamepadInfo,
  farminGamepadToAutorunInfo,
} from "./gamepadfunction.js";
import startCanvasRendering from "./drawCanvas.js";
import { ONNXInferenceEngine } from './onnxInference.js';

const gamepadToAutorunInfoCon = gamepadToAutorunInfo();
const farminGamepadToAutorunInfoCon = farminGamepadToAutorunInfo();
const signalingWebSocket = new WebSocket("ws://localhost:8080");
// ↓ Answer側PCのIPアドレスに変更
//const signalingWebSocket = new WebSocket("ws://10.100.0.35:8080");
// const virtualWebSocket = new WebSocket("ws://localhost:9090/"); // エラーの原因①：WebSocketサーバーへの接続
let peerConnection;
let movieChannel;
let dataChannel;
const videoElement = document.getElementById("remote-video");
const canvasElement = document.getElementById("video-canvas");
const canvasSonoki = document.getElementById('video-canvas-sonoki');

// ONNX Inference Engine
let onnxEngine = null;
let largeDetectionCanvas = null;
let largeDetectionContext = null;
let isInferenceEnabled = false; // 推論の有効/無効状態（デフォルトオフ）
let currentDetections = []; // 現在の検出結果を保存

// =====安全システム=====
class SafetySystem {
  constructor() {
    this.isActive = false; // 安全システムの有効/無効
    this.isSafetyTriggered = false; // 安全停止が発動中かどうか
    this.personDetectionHistory = []; // 人検知履歴
    this.confirmationThreshold = 3; // 連続検知回数の閾値
    this.confirmationTimeWindow = 2000; // 確認時間窓（ms）
    this.safetyResetTimeout = null;
    this.lastSafetyTrigger = 0;
    this.noPersonResetTimeout = null; // 人がいなくなった際の自動リセット用タイマー
    this.lastPersonDetectionTime = 0; // 最後に人を検知した時間
    
    // 安全設定
    this.settings = {
      enabled: false, // 安全システム有効/無効
      autoReset: true, // 自動リセット機能（デフォルトで有効）
      autoResetDelay: 0, // 瞬時リセット（遅延なし）
      minimumPersonSize: 1000, // 最小検出サイズ（ピクセル²）
      safetyZoneOnly: false // 安全ゾーンのみ監視
    };
  }

  // 安全システムの有効化/無効化
  setEnabled(enabled) {
    this.settings.enabled = enabled;
    if (!enabled) {
      this.resetSafety();
    }
    console.log(`Safety system ${enabled ? 'enabled' : 'disabled'}`);
    this.updateSafetyStatus();
  }

  // 人検知結果を処理
  processDetections(detections) {
    if (!this.settings.enabled) return;

    const currentTime = Date.now();
    const personDetections = detections.filter(d => d.classId === 0); // 人のみ
    
    // 最小サイズフィルター適用
    const validPersons = personDetections.filter(person => {
      const area = person.bbox.width * person.bbox.height;
      return area >= this.settings.minimumPersonSize;
    });

    // 人が検知されている場合、最後の検知時間を更新
    if (validPersons.length > 0) {
      this.lastPersonDetectionTime = currentTime;
      
      // 人がいる間は自動リセットタイマーをクリア
      if (this.noPersonResetTimeout) {
        clearTimeout(this.noPersonResetTimeout);
        this.noPersonResetTimeout = null;
      }
    }

    // 検知履歴に追加
    this.personDetectionHistory.push({
      timestamp: currentTime,
      count: validPersons.length,
      persons: validPersons
    });

    // 古い履歴を削除（時間窓外）
    this.personDetectionHistory = this.personDetectionHistory.filter(
      entry => currentTime - entry.timestamp <= this.confirmationTimeWindow
    );

    // 安全判定
    this.evaluateSafety();
    
    // 安全停止中で人がいなくなった場合の自動リセット処理
    this.checkForAutoReset(validPersons.length, currentTime);
  }

  // 安全状態の評価
  evaluateSafety() {
    const recentDetections = this.personDetectionHistory.filter(
      entry => entry.count > 0
    );

    // 連続検知判定
    if (recentDetections.length >= this.confirmationThreshold && !this.isSafetyTriggered) {
      this.triggerSafety(recentDetections);
    }
  }

  // 自動リセットのチェック
  checkForAutoReset(currentPersonCount, currentTime) {
    // 安全停止中でない場合は何もしない
    if (!this.isSafetyTriggered) return;
    
    // 自動リセットが無効の場合は何もしない
    if (!this.settings.autoReset) return;

    // 現在人が検知されている場合は何もしない
    if (currentPersonCount > 0) return;

    // 過去の確認時間窓内で人が検知されていないかチェック
    const recentPersonDetections = this.personDetectionHistory.filter(
      entry => entry.count > 0 && (currentTime - entry.timestamp) <= this.confirmationTimeWindow
    );

    // まだ人が検知されている履歴がある場合は待機
    if (recentPersonDetections.length > 0) return;

    // 自動リセットタイマーがまだ設定されていない場合は設定
    if (!this.noPersonResetTimeout) {
      // 遅延が0の場合は即座に実行
      if (this.settings.autoResetDelay === 0) {
        console.log('No person detected. Executing immediate auto-reset');
        this.resetSafety(true); // 自動リセットフラグ付きで実行
        return;
      }
      
      console.log(`No person detected. Auto-reset will trigger in ${this.settings.autoResetDelay}ms`);
      
      this.noPersonResetTimeout = setTimeout(() => {
        // タイマー実行時に再度確認
        const finalCheck = this.personDetectionHistory.filter(
          entry => entry.count > 0 && (Date.now() - entry.timestamp) <= this.confirmationTimeWindow
        );
        
        if (finalCheck.length === 0) {
          console.log('🔄 AUTO-RESET: No person detected, resetting safety system');
          this.resetSafety();
        } else {
          console.log('Auto-reset cancelled: Person detected during waiting period');
          this.noPersonResetTimeout = null;
          this.updateSafetyStatus(); // UI更新
        }
      }, this.settings.autoResetDelay);
      
      // UI更新（自動リセット待機状態を表示）
      this.updateSafetyStatus();
    }
  }

  // 安全停止の発動
  triggerSafety(detections) {
    this.isSafetyTriggered = true;
    this.lastSafetyTrigger = Date.now();

    console.warn('🚨 SAFETY TRIGGERED: Person detected!');

    // 緊急アラート音を再生
    if (audioAlertSystem) {
      audioAlertSystem.playEmergencyAlert();
    }

    // トラクタ停止信号を送信
    this.sendTractorStop();

    // パトライト点灯信号を送信
    this.sendWarningLight(true);

    // UI更新
    this.updateSafetyStatus();

    // 安全イベントをログ
    this.logSafetyEvent('TRIGGERED', detections);
  }

  // 安全リセット（手動・自動共通）
  resetSafety() {
    // すべてのタイマーをクリア
    if (this.safetyResetTimeout) {
      clearTimeout(this.safetyResetTimeout);
      this.safetyResetTimeout = null;
    }
    
    if (this.noPersonResetTimeout) {
      clearTimeout(this.noPersonResetTimeout);
      this.noPersonResetTimeout = null;
    }
    
    this.isSafetyTriggered = false;
    this.personDetectionHistory = [];
    this.lastPersonDetectionTime = 0;
    
    console.log('✅ Safety system reset');
    
    // パトライト消灯
    this.sendWarningLight(false);
    
    // UI更新
    this.updateSafetyStatus();
    
    // 安全イベントをログ
    this.logSafetyEvent('RESET', []);
  }

  // トラクタ停止信号送信
  sendTractorStop() {
    const stopSignal = {
      type: "emergency_stop",
      timestamp: Date.now(),
      reason: "person_detected"
    };

    // WebRTCデータチャネル経由で送信
    if (dataChannel && dataChannel.readyState === "open") {
      try {
        dataChannel.send(JSON.stringify(stopSignal));
        console.log('Emergency stop signal sent');
      } catch (error) {
        console.error('Failed to send emergency stop:', error);
      }
    }

    // WebSocket経由でも送信（バックアップ）
    if (signalingWebSocket && signalingWebSocket.readyState === WebSocket.OPEN) {
      try {
        signalingWebSocket.send(JSON.stringify({
          type: "safety_alert",
          payload: stopSignal
        }));
      } catch (error) {
        console.error('Failed to send safety alert via WebSocket:', error);
      }
    }
  }

  // パトライト制御信号送信
  sendWarningLight(activate) {
    const lightSignal = {
      type: "warning_light",
      action: activate ? "on" : "off",
      timestamp: Date.now()
    };

    // WebRTCデータチャネル経由で送信
    if (dataChannel && dataChannel.readyState === "open") {
      try {
        dataChannel.send(JSON.stringify(lightSignal));
        console.log(`Warning light ${activate ? 'activated' : 'deactivated'}`);
      } catch (error) {
        console.error('Failed to send warning light signal:', error);
      }
    }

    // パトライト音声も制御
    if (audioAlertSystem) {
      if (activate) {
        audioAlertSystem.startContinuousBeep();
      } else {
        audioAlertSystem.stopContinuousBeep();
      }
    }
  }

  // 安全イベントのログ記録
  logSafetyEvent(eventType, detections) {
    const event = {
      timestamp: new Date().toISOString(),
      type: eventType,
      personCount: detections.length,
      detections: detections.map(d => ({
        confidence: d.confidence,
        bbox: d.bbox
      }))
    };

    // ローカルストレージに保存
    try {
      const existingLogs = JSON.parse(localStorage.getItem('safetyLogs') || '[]');
      existingLogs.push(event);
      
      // 最新100件のみ保持
      if (existingLogs.length > 100) {
        existingLogs.splice(0, existingLogs.length - 100);
      }
      
      localStorage.setItem('safetyLogs', JSON.stringify(existingLogs));
    } catch (error) {
      console.error('Failed to save safety log:', error);
    }
  }

  // UI状態更新
  updateSafetyStatus() {
    const statusElement = document.getElementById("safety-status");
    if (!statusElement) return;

    if (!this.settings.enabled) {
      statusElement.textContent = "安全システム: 無効";
      statusElement.className = "safety-disabled";
    } else if (this.isSafetyTriggered) {
      if (this.noPersonResetTimeout) {
        statusElement.textContent = "🔄 自動リセット待機中 - 人が検知されなくなりました";
        statusElement.className = "safety-resetting";
      } else {
        statusElement.textContent = "🚨 緊急停止中 - 人を検知";
        statusElement.className = "safety-triggered";
      }
    } else {
      statusElement.textContent = "安全システム: 監視中";
      statusElement.className = "safety-active";
    }
  }

  // 安全ログのエクスポート
  exportSafetyLogs() {
    try {
      const logs = JSON.parse(localStorage.getItem('safetyLogs') || '[]');
      if (logs.length === 0) {
        console.log('No safety logs to export');
        return;
      }

      const csv = [
        'timestamp,event_type,person_count,detection_details',
        ...logs.map(log => 
          `${log.timestamp},${log.type},${log.personCount},"${JSON.stringify(log.detections)}"`
        )
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `safety_logs_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      console.log(`Exported ${logs.length} safety logs`);
    } catch (error) {
      console.error('Failed to export safety logs:', error);
    }
  }
}

// 安全システムインスタンスを作成
const safetySystem = new SafetySystem();

// =====音声アラートシステム=====
class AudioAlertSystem {
  constructor() {
    this.audioContext = null;
    this.isEnabled = true;
    this.alertVolume = 0.5; // 0.0 - 1.0
    this.initializeAudio();
  }

  async initializeAudio() {
    try {
      // WebAudioAPIコンテキスト初期化
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('Audio context initialized');
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
    }
  }

  // 緊急アラート音を生成・再生
  playEmergencyAlert() {
    if (!this.audioContext || !this.isEnabled) return;

    // ユーザーインタラクションが必要な場合は、コンテキストを再開
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const duration = 2.0; // 2秒間
    const frequency1 = 800; // 高音
    const frequency2 = 400; // 低音

    // オシレーター1（高音）
    const oscillator1 = this.audioContext.createOscillator();
    const gainNode1 = this.audioContext.createGain();

    oscillator1.frequency.setValueAtTime(frequency1, this.audioContext.currentTime);
    oscillator1.type = 'sine';

    // エンベロープ設定（急激な音量変化を避ける）
    gainNode1.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode1.gain.linearRampToValueAtTime(this.alertVolume * 0.8, this.audioContext.currentTime + 0.1);
    gainNode1.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator1.connect(gainNode1);
    gainNode1.connect(this.audioContext.destination);

    oscillator1.start(this.audioContext.currentTime);
    oscillator1.stop(this.audioContext.currentTime + duration);

    // オシレーター2（低音、0.5秒後に開始）
    setTimeout(() => {
      if (!this.audioContext) return;

      const oscillator2 = this.audioContext.createOscillator();
      const gainNode2 = this.audioContext.createGain();

      oscillator2.frequency.setValueAtTime(frequency2, this.audioContext.currentTime);
      oscillator2.type = 'sine';

      gainNode2.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode2.gain.linearRampToValueAtTime(this.alertVolume * 0.6, this.audioContext.currentTime + 0.1);
      gainNode2.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration - 0.5);

      oscillator2.connect(gainNode2);
      gainNode2.connect(this.audioContext.destination);

      oscillator2.start(this.audioContext.currentTime);
      oscillator2.stop(this.audioContext.currentTime + duration - 0.5);
    }, 500);

    console.log('🔊 Emergency alert sound played');
  }

  // パトライト音を生成・再生
  playWarningBeep() {
    if (!this.audioContext || !this.isEnabled) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const beepDuration = 0.3;
    const frequency = 1000;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = 'square';

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(this.alertVolume * 0.4, this.audioContext.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + beepDuration);

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + beepDuration);
  }

  // 連続ビープ音（パトライト用）
  startContinuousBeep() {
    if (!this.isEnabled) return;

    this.stopContinuousBeep();

    this.beepInterval = setInterval(() => {
      this.playWarningBeep();
    }, 800); // 0.8秒間隔

    console.log('🔊 Continuous warning beep started');
  }

  // 連続ビープ音停止
  stopContinuousBeep() {
    if (this.beepInterval) {
      clearInterval(this.beepInterval);
      this.beepInterval = null;
      console.log('🔇 Continuous warning beep stopped');
    }
  }

  // 音量設定
  setVolume(volume) {
    this.alertVolume = Math.max(0, Math.min(1, volume));
    console.log(`Audio alert volume set to ${(this.alertVolume * 100).toFixed(0)}%`);
  }

  // 音声アラート有効/無効
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.stopContinuousBeep();
    }
    console.log(`Audio alerts ${enabled ? 'enabled' : 'disabled'}`);
  }

  // AudioContextのクリーンアップ
  cleanup() {
    this.stopContinuousBeep();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}

// 音声アラートシステムインスタンスを作成
const audioAlertSystem = new AudioAlertSystem();

// ステータス表示更新
function updateInferenceStatus(status) {
  const statusElement = document.getElementById("inference-status");
  if (statusElement) {
    statusElement.textContent = `状態: ${status}`;
    statusElement.className = isInferenceEnabled ? "status-enabled" : "status-disabled";
  }
}


// Canvas表示制御（軽量化のため）
let isCanvasVisible = false;
let isCanvasFullscreen = false;

function toggleCanvas() {
  const canvas = document.getElementById("large-detection-canvas");
  const checkbox = document.getElementById("canvas-toggle");
  const fullscreenBtn = document.getElementById("canvas-fullscreen-btn");
  
  isCanvasVisible = checkbox.checked;
  canvas.style.display = isCanvasVisible ? "block" : "none";
  fullscreenBtn.style.display = isCanvasVisible ? "inline-block" : "none";
  
  console.log(`Detection Canvas ${isCanvasVisible ? "表示" : "非表示"}`);
}

function toggleCanvasFullscreen() {
  const canvas = document.getElementById("large-detection-canvas");
  const fullscreenBtn = document.getElementById("canvas-fullscreen-btn");
  
  if (!isCanvasFullscreen) {
    // 全画面表示にする
    canvas.classList.add("fullscreen");
    fullscreenBtn.textContent = "全画面終了";
    isCanvasFullscreen = true;
    
    // bodyのスクロールを無効化
    document.body.style.overflow = "hidden";
    
    // ESCキーで全画面終了
    const handleEscKey = (e) => {
      if (e.key === "Escape" && isCanvasFullscreen) {
        exitFullscreen();
      }
    };
    
    // クリックで全画面終了
    const handleCanvasClick = (e) => {
      // canvas上でのクリックで全画面終了
      exitFullscreen();
    };
    
    // イベントリスナーを追加
    document.addEventListener("keydown", handleEscKey);
    canvas.addEventListener("click", handleCanvasClick);
    
    // 終了関数を定義
    const exitFullscreen = () => {
      canvas.classList.remove("fullscreen");
      fullscreenBtn.textContent = "全画面表示";
      isCanvasFullscreen = false;
      document.body.style.overflow = "";
      
      // イベントリスナーを削除
      document.removeEventListener("keydown", handleEscKey);
      canvas.removeEventListener("click", handleCanvasClick);
      
      console.log("Detection Canvas 通常表示");
    };
    
    // 全画面終了関数をボタンにも設定
    fullscreenBtn.onclick = exitFullscreen;
    
  } else {
    // 全画面表示を終了（直接呼び出し用）
    canvas.classList.remove("fullscreen");
    fullscreenBtn.textContent = "全画面表示";
    isCanvasFullscreen = false;
    document.body.style.overflow = "";
    fullscreenBtn.onclick = toggleCanvasFullscreen;
  }
  
  console.log(`Detection Canvas ${isCanvasFullscreen ? "全画面表示" : "通常表示"}`);
}

// 安全システム制御関数
function toggleSafety() {
  const checkbox = document.getElementById("safety-enable");
  const resetButton = document.getElementById("safety-reset");
  
  safetySystem.setEnabled(checkbox.checked);
  resetButton.disabled = !checkbox.checked;
}

function resetSafety() {
  safetySystem.resetSafety();
}

function exportSafetyLogs() {
  safetySystem.exportSafetyLogs();
}

// グローバル関数として登録
window.toggleCanvas = toggleCanvas;
window.toggleCanvasFullscreen = toggleCanvasFullscreen;
window.toggleSafety = toggleSafety;
window.resetSafety = resetSafety;
window.exportSafetyLogs = exportSafetyLogs;

// Initialize ONNX model with WebGPU acceleration
async function initONNXModel() {
  try {
    onnxEngine = new ONNXInferenceEngine();
    const success = await onnxEngine.initializeModel();
    
    if (success) {
      // Get large detection canvas
      largeDetectionCanvas = document.getElementById("large-detection-canvas");
      largeDetectionContext = largeDetectionCanvas.getContext("2d");
      console.log("ONNX inference engine initialized on offer side");
      return true;
    } else {
      console.error("Failed to initialize ONNX inference engine on offer side");
      return false;
    }
  } catch (error) {
    console.error("Error initializing ONNX inference engine on offer side:", error);
    return false;
  }
}

// Stream video to large canvas
function streamToCanvas(videoElement, canvas, context) {
  if (!canvas || !context || !videoElement || videoElement.videoWidth === 0)
    return;

  // Draw video frame to large canvas (1920x1080)
  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
}

// Draw bounding boxes on large canvas (1920x1080)
function drawBoundingBoxesOnLargeCanvas(detections) {
  if (!largeDetectionCanvas || !largeDetectionContext) {
    console.error("Offer Large canvas not available");
    return;
  }

  // Note: We don't clear the canvas here because we want to keep the video stream

  if (detections.length === 0) {
    return;
  }

  // Scale factors from 640x640 model input to 1920x1080 canvas
  const scaleX = 1920 / 640;
  const scaleY = 1080 / 640;

  // COCO class names
  const classNames = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
    "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard",
    "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
    "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
    "hair drier", "toothbrush",
  ];

  detections.forEach((detection, idx) => {
    const bbox = detection.bbox;

    // Scale coordinates from 640x640 to 1920x1080
    const x = bbox.x * scaleX;
    const y = bbox.y * scaleY;
    const width = bbox.width * scaleX;
    const height = bbox.height * scaleY;

    // Choose color for this detection
    const hue = (idx * 137.5) % 360;
    const boxColor = `hsl(${hue}, 100%, 50%)`;

    // Draw bounding box
    largeDetectionContext.strokeStyle = boxColor;
    largeDetectionContext.lineWidth = 6; // Thicker lines for large canvas
    largeDetectionContext.strokeRect(x, y, width, height);

    // Prepare label text
    const className =
      classNames[detection.classId] || `Class ${detection.classId}`;
    const confidence = (detection.confidence * 100).toFixed(1);
    const label = `${className} ${confidence}%`;

    // Set font and measure text (larger for large canvas)
    largeDetectionContext.font = "bold 32px Arial";
    const textMetrics = largeDetectionContext.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 40;

    // Calculate label position
    const labelX = Math.max(0, x);
    const labelY = Math.max(textHeight, y);

    // Draw label background
    largeDetectionContext.fillStyle = boxColor;
    largeDetectionContext.fillRect(
      labelX,
      labelY - textHeight,
      textWidth + 16,
      textHeight + 8
    );

    // Draw label text
    largeDetectionContext.fillStyle = "white";
    largeDetectionContext.fillText(label, labelX + 8, labelY - 8);
  });
}

// Run ONNX inference using the inference engine
async function runInference(videoElement) {
  console.log("=== OFFER SIDE INFERENCE DEBUG ===");
  console.log("onnxEngine exists:", !!onnxEngine);
  console.log("videoElement exists:", !!videoElement);
  console.log("videoElement.videoWidth:", videoElement?.videoWidth);
  console.log("videoElement.videoHeight:", videoElement?.videoHeight);
  console.log("videoElement.readyState:", videoElement?.readyState);
  
  if (!onnxEngine || !videoElement || videoElement.videoWidth === 0) {
    console.log("OFFER SIDE: Inference conditions not met");
    return null;
  }
  
  console.log("OFFER SIDE: Running inference...");
  const result = await onnxEngine.runInference(videoElement, "offer");
  console.log("OFFER SIDE: Inference result:", result);
  return result;
}

// Performance monitoring variables for offer side
let inferenceCount = 0;
let totalInferenceTime = 0;
let dynamicInterval = 166; // Start with 166ms (6 FPS) - さらに軽量化
let isInferenceBusy = false; // 推論処理中フラグ
let inferenceWorker = null; // Web Worker for offloading inference

// Start continuous inference on received video stream with adaptive FPS
function startVideoInference(videoElement) {
  async function inferenceLoop() {
    if (videoElement && videoElement.videoWidth > 0) {
      const startTime = performance.now();

      // Stream video to large canvas (表示時のみ実行で軽量化)
      if (isCanvasVisible) {
        streamToCanvas(videoElement, largeDetectionCanvas, largeDetectionContext);
      }

      // Only run inference if enabled and not already busy
      console.log("OFFER INFERENCE LOOP: isInferenceEnabled =", isInferenceEnabled, "isInferenceBusy =", isInferenceBusy);
      if (isInferenceEnabled && !isInferenceBusy) {
        console.log("OFFER: Starting inference...");
        isInferenceBusy = true;
        try {
          const results = await runInference(videoElement);
          if (results && results.detections) {
            // Update current detections for video-canvas rendering
            currentDetections = results.detections;
            
            // 安全システムに検出結果を送信
            safetySystem.processDetections(results.detections);
            
            // Draw bounding boxes on large canvas（表示時のみ）
            if (isCanvasVisible) {
              drawBoundingBoxesOnLargeCanvas(results.detections);
            }

            // Send results through WebRTC data channel (効率化とデータ削減)
            if (dataChannel && dataChannel.readyState === "open") {
              // 人検出のみに絞って送信（classId === 0）
              const personDetections = results.detections.filter(d => d.classId === 0);
              
              if (personDetections.length > 0) {
                const optimizedDetections = personDetections.map(d => ([
                  Math.round(d.bbox.x), Math.round(d.bbox.y), 
                  Math.round(d.bbox.width), Math.round(d.bbox.height),
                  Math.round(d.confidence * 1000) // 0-1000の整数値
                ]));
                
                // コンパクトなフォーマットで送信
                const compactMessage = {
                  t: "offer_detect", // type短縮
                  ts: Date.now(),
                  d: optimizedDetections, // detections
                  c: personDetections.length // count
                };
                
                try {
                  dataChannel.send(JSON.stringify(compactMessage));
                } catch (sendError) {
                  console.warn("Failed to send detection data:", sendError.message);
                }
              }
            }
          }
        } finally {
          isInferenceBusy = false;
        }
      } else {
        // Clear detection displays when inference is disabled
        currentDetections = []; // Clear current detections for video-canvas
      }

      const endTime = performance.now();
      const inferenceTime = endTime - startTime;

      // Update performance metrics
      inferenceCount++;
      totalInferenceTime += inferenceTime;

      if (inferenceCount % 30 === 0) {
        // Log every 30 inferences
        const avgInferenceTime = totalInferenceTime / 30;
        const actualFPS = 1000 / (avgInferenceTime + dynamicInterval);
        console.log(
          `Offer side - Average inference time: ${avgInferenceTime.toFixed(
            1
          )}ms, Actual FPS: ${actualFPS.toFixed(1)}`
        );

        // Adaptive interval adjustment (よりスムーズな映像のため保守的に)
        if (avgInferenceTime < 80) {
          dynamicInterval = Math.max(133, dynamicInterval - 8); // Up to 7.5 FPS
        } else if (avgInferenceTime < 120) {
          dynamicInterval = Math.max(166, dynamicInterval - 5); // Up to 6 FPS
        } else if (avgInferenceTime > 300) {
          dynamicInterval = Math.min(1000, dynamicInterval + 50); // Down to 1 FPS
        }
        
        // ONNXエンジンの推論間隔も調整
        if (onnxEngine) {
          onnxEngine.adjustInferenceInterval(avgInferenceTime);
        }

        totalInferenceTime = 0;
        inferenceCount = 0;
      }
    }

    // Schedule next inference (requestAnimationFrame使用でブラウザに最適化を委ねる)
    if (isInferenceEnabled) {
      // 推論有効時でも映像表示を優先し、より長い間隔に
      setTimeout(inferenceLoop, dynamicInterval);
    } else {
      // 推論オフ時はさらに軽量に - 映像の滑らかさを最優先
      setTimeout(inferenceLoop, 200); // 推論オフ時はより軽量
    }
  }

  // Start the inference loop
  inferenceLoop();
}

const inputAutorunInfo = {
  type: "inputAutorunInfo",
  inputSteer: 0,
  inputEngineCycle: 0,
  inputGear: 1,
  inputShuttle: 0,
  inputSpeed: 3,
  inputPtoHeight: 100,
  inputPtoOn: 0,
  inputHorn: 0,
  isRemoteCont: true,
  isAutoRunStart: 0,
  isUseSafetySensorInTeleDrive: 0,
};

const outputAutorunInfo = {
  type: "outputAutorunInfo",
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

const virtualInputInfo = {
  outputLat: 0,
  outputLon: 0,
  outputHeading: 0,
  outputVelocity: 0,
  outputCalcAutoSteer: 0,
  outputSteer: 0,
  inputVelocity: 0,
  inputSteering: 0,
  inputShuttle: 0,
  inputRemoteCont: 0,
  start: false,
};

window.addEventListener("gamepadconnected", (event) => {
  onGamepadConnected(event);
  requestAnimationFrame(updateAutorunLoop);
});
window.addEventListener("gamepaddisconnected", onGamepadDisconnected);

function updateAutorunLoop() {
  const gamepads = navigator.getGamepads();
  const usingGamepad = gamepads[0];
  if (usingGamepad) {
    gamepadToAutorunInfoCon(inputAutorunInfo, usingGamepad);
    drawGamepadInfo(inputAutorunInfo);
  }
  requestAnimationFrame(updateAutorunLoop);
}

signalingWebSocket.onmessage = async (event) => {
  const { type, payload } = JSON.parse(event.data);

  if (type === "answer") {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: "answer", sdp: payload.sdp })
    );
  } else if (type === "ice") {
    await peerConnection.addIceCandidate(
      new RTCIceCandidate(payload.candidate)
    );
  }
};

signalingWebSocket.onopen = () => {
  signalingWebSocket.send(
    JSON.stringify({ type: "register-offer", payload: { id: "offer" } })
  );
};

/* エラーの原因②：接続が確立する前にsend()を呼び出している
virtualWebSocket.onopen = () => {
  virtualWebSocket.send(
    JSON.stringify({
      type: "from-offer-init",
      payload: inputAutorunInfo,
    })
  );
};
*/

async function startConnection() {
  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:10.100.0.35:3478" }],
  });
  console.log("PeerConnection is created!");

  movieChannel = peerConnection.addTransceiver("video", {
    direction: "recvonly",
  });

  dataChannel = peerConnection.createDataChannel("chat");
  dataChannel.onopen = () => {
    console.log("DataChannel is open");
    setInterval(() => {
      dataChannel.send(JSON.stringify(inputAutorunInfo));
    }, 33);
  };
  dataChannel.onmessage = (event) => {
    const fromAnswerWebRtcData = JSON.parse(event.data);
    if (fromAnswerWebRtcData.type === "outputAutorunInfo") {
      outputAutorunInfo.lat = fromAnswerWebRtcData.payload.lat;
      outputAutorunInfo.lon = fromAnswerWebRtcData.payload.lon;
      outputAutorunInfo.gnssQuality = fromAnswerWebRtcData.payload.gnssQuality;
      outputAutorunInfo.gnssSpeed = fromAnswerWebRtcData.payload.gnssSpeed;
      outputAutorunInfo.heading = fromAnswerWebRtcData.payload.heading;
      outputAutorunInfo.headingError =
        fromAnswerWebRtcData.payload.headingError;
      outputAutorunInfo.lateralError =
        fromAnswerWebRtcData.payload.lateralError;
      outputAutorunInfo.steerAngle = fromAnswerWebRtcData.payload.steerAngle;
      outputAutorunInfo.realSteerAngle =
        fromAnswerWebRtcData.payload.realSteerAngle;
      outputAutorunInfo.stopStatus = fromAnswerWebRtcData.payload.stopStatus;
    } else if (fromAnswerWebRtcData.type === "inferenceResults") {
      console.log(
        "Received inference results from answer side:",
        fromAnswerWebRtcData.payload
      );
    } else if (fromAnswerWebRtcData.type === "detection_sync") {
      // Answer側からの検出同期データを処理
      console.log("Received detection sync from answer side:", fromAnswerWebRtcData);
      
      // 安全システムが有効かつ検出データがある場合、安全システムに通知
      if (safetySystem && safetySystem.isEnabled) {
        safetySystem.checkForAutoReset(fromAnswerWebRtcData.personCount, fromAnswerWebRtcData.timestamp);
      }
    }
  };

  const remoteStream = new MediaStream();
  peerConnection.ontrack = (event) => {
    console.log("OFFER: Received track from Answer side:", event.track);
    console.log("OFFER: Track readyState:", event.track.readyState);
    console.log("OFFER: Track enabled:", event.track.enabled);
    console.log("OFFER: Track kind:", event.track.kind);
    remoteStream.addTrack(event.track);
    videoElement.srcObject = remoteStream;
    console.log("OFFER: Video element srcObject set");

    // Force video play
    //videoElement.play().catch(e => console.log("Play failed:", e));

    // Add multiple event listeners for debugging
    videoElement.addEventListener("loadstart", () => console.log("OFFER: Video loadstart"));
    videoElement.addEventListener("loadedmetadata", () => console.log("OFFER: Video loadedmetadata"));
    videoElement.addEventListener("canplay", () => console.log("OFFER: Video canplay"));
    videoElement.addEventListener("canplaythrough", () => console.log("OFFER: Video canplaythrough"));
    videoElement.addEventListener("playing", () => console.log("OFFER: Video playing"));
    videoElement.addEventListener("error", (e) => console.log("OFFER: Video error:", e));

    // Check video element properties immediately
    setTimeout(() => {
      console.log("OFFER: Video readyState:", videoElement.readyState);
      console.log("OFFER: Video networkState:", videoElement.networkState);
      console.log("OFFER: Video dimensions:", videoElement.videoWidth, "x", videoElement.videoHeight);
      console.log("OFFER: Video currentTime:", videoElement.currentTime);
      console.log("OFFER: Video duration:", videoElement.duration);
    }, 1000);

    videoElement.addEventListener("loadeddata", async () => {
      console.log("OFFER: Video loadeddata event fired");
      console.log("OFFER: Video dimensions:", videoElement.videoWidth, "x", videoElement.videoHeight);
      await initONNXModel();
      console.log("OFFER: Starting video inference loop");
      startVideoInference(videoElement);
      
      const inferenceOnRadio = document.getElementById("inference-on");
      const inferenceOffRadio = document.getElementById("inference-off");
      
      inferenceOnRadio.addEventListener("change", () => {
        if (inferenceOnRadio.checked) {
          isInferenceEnabled = true;
          console.log("Offer side inference enabled");
          updateInferenceStatus("推論有効");
        }
      });
      
      inferenceOffRadio.addEventListener("change", () => {
        if (inferenceOffRadio.checked) {
          isInferenceEnabled = false;
          currentDetections = [];
          console.log("Offer side inference disabled");
          updateInferenceStatus("推論無効");
          // メモリクリーンアップ
          if (onnxEngine) {
            onnxEngine.cleanupMemory();
          }
        }
      });
      
      // 初期状態表示
      updateInferenceStatus("推論無効");
    });
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      signalingWebSocket.send(
        JSON.stringify({
          type: "ice-offer",
          payload: { candidate: event.candidate },
        })
      );
    }
  };

  const offer = await peerConnection.createOffer();
  offer.sdp = prioritizeSelectedVideoCodec(offer.sdp);

  await peerConnection.setLocalDescription(offer);
  signalingWebSocket.send(
    JSON.stringify({ type: "offer", payload: { sdp: offer.sdp } })
  );
}

document
  .getElementById("send-sdp-by-ws")
  .addEventListener("click", startConnection);

// ===== ここから詳細WebRTC統計ログ機能 =====
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



setInterval(async function collectCompleteOfferWebRTCStats() {
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
    side: 'offer',
    [translateStatKey('connection_state')]: peerConnection.connectionState,
    [translateStatKey('ice_connection_state')]: peerConnection.iceConnectionState,
    [translateStatKey('ice_gathering_state')]: peerConnection.iceGatheringState,
    [translateStatKey('signaling_state')]: peerConnection.signalingState
  };

  // === 推論結果情報を追加（英語項目名） ===
  if (isInferenceEnabled && onnxEngine) {
    const perfStats = onnxEngine.getPerformanceStats();
    logEntry[translateStatKey('inference_enabled')] = true;
    logEntry[translateStatKey('total_inferences')] = perfStats.totalInferences || 0;
    logEntry[translateStatKey('skipped_frames_inference')] = perfStats.skippedFrames || 0;
    logEntry[translateStatKey('min_inference_interval_ms')] = onnxEngine.minInferenceInterval || 0;

    // 現在の検出結果統計を追加
    if (currentDetections && currentDetections.length > 0) {
      const personDetections = currentDetections.filter(d => d.classId === 0);
      logEntry[translateStatKey('detections_count')] = currentDetections.length;
      logEntry[translateStatKey('detections_person_count')] = personDetections.length;
      const confidences = currentDetections.map(d => d.confidence);
      logEntry[translateStatKey('max_confidence')] = Math.max(...confidences);
      logEntry[translateStatKey('min_confidence')] = Math.min(...confidences);
      logEntry[translateStatKey('avg_confidence')] = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;

      // 人検知の詳細統計
      if (personDetections.length > 0) {
        const personAreas = personDetections.map(p => p.bbox.width * p.bbox.height);
        logEntry[translateStatKey('person_max_area')] = Math.max(...personAreas);
        logEntry[translateStatKey('person_min_area')] = Math.min(...personAreas);
        logEntry[translateStatKey('person_avg_area')] = personAreas.reduce((sum, area) => sum + area, 0) / personAreas.length;
      }
    } else {
      logEntry[translateStatKey('detections_count')] = 0;
      logEntry[translateStatKey('detections_person_count')] = 0;
      logEntry[translateStatKey('max_confidence')] = 0;
    }
  } else {
    logEntry[translateStatKey('inference_enabled')] = false;
  }

  // 全てのstatsタイプを処理（英語変換付き）
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

  // メモリ使用量制限（最新1000エントリまで保持）
  if (webrtcStatsLogs.length > 1000) {
    webrtcStatsLogs.splice(0, webrtcStatsLogs.length - 1000);
  }
}, 1000);

// 統一WebRTC統計のCSV出力機能
function saveDetailedWebRTCStats() {
  console.log("=== Offer側WebRTC統計保存機能デバッグ ===");
  console.log("ボタンクリック検知: OK");
  console.log("webrtcStatsLogs配列長:", webrtcStatsLogs.length);
  console.log("peerConnection状態:", peerConnection ? peerConnection.connectionState : "未接続");
  console.log("統計スキーマ: Offer側全WebRTCStats対応（推論情報含む）");

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
    a.download = `offer_webrtc_stats_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log(`✅ Offer側WebRTC統計を保存: ${webrtcStatsLogs.length}エントリ (${ts})`);
    alert(`Offer側統計データを保存しました (${webrtcStatsLogs.length}エントリ、${headers.length}項目)`);
  } else {
    console.warn("❌ 保存する統計データがありません");
    console.log("統計収集が動作していない可能性があります");
    console.log("WebRTC接続を確立してからお試しください");
    alert("保存する統計データがありません。WebRTC接続を確立してからお試しください。");
  }
}

// 統計データクリア機能
function clearWebRTCStats() {
  webrtcStatsLogs.length = 0;
  console.log("WebRTC統計データをクリアしました");
}

// 詳細統計保存とクリアのイベントリスナー
document.getElementById("save-delay-log").addEventListener("click", saveDetailedWebRTCStats);
document.getElementById("clear-stats").addEventListener("click", clearWebRTCStats);
// ===== 遅延ログ機能ここまで =====

/**
 * @name setVideoQuality
 * @description HTMLの入力値を取得し、DataChannel経由でAnswerに映像品質の変更を要求します。
 * @param {RTCDataChannel} dataChannel - 設定を送信するためのデータチャネル
 */
function setVideoQuality(dataChannel) {
  const bitrate = document.getElementById("set-video-bitrate").value;
  const height = document.getElementById("set-video-height").value;
  const width = document.getElementById("set-video-width").value;
  const framerate = document.getElementById("set-video-framerate").value;

  if (dataChannel && dataChannel.readyState === "open") {
    const qualitySettings = {
      type: "videoQualityChange",
      payload: {
        bitrate: parseInt(bitrate, 10),
        height: parseInt(height, 10),
        width: parseInt(width, 10),
        framerate: parseInt(framerate, 10),
      }
    };
    dataChannel.send(JSON.stringify(qualitySettings));
    console.log("Sent video quality settings:", qualitySettings);
  } else {
    console.error("DataChannel is not open. Cannot send video quality settings.");
  }
}

// SetVideoQualityボタンのイベントリスナー
document.getElementById("set-video-quality").addEventListener("click", () => {
  setVideoQuality(dataChannel);
});

/* エラーの原因③：接続が確立する前にsend()を呼び出している
setInterval(() => {
  virtualInputInfo.inputSteering = inputAutorunInfo.inputSteer;
  virtualInputInfo.inputVelocity = inputAutorunInfo.inputSpeed;
  virtualInputInfo.inputShuttle = inputAutorunInfo.inputShuttle;
  virtualInputInfo.inputRemoteCont = inputAutorunInfo.isRemoteCont;
  virtualInputInfo.outputLat = outputAutorunInfo.lat;
  virtualInputInfo.outputLon = outputAutorunInfo.lon;
  virtualInputInfo.outputHeading = outputAutorunInfo.heading;
  virtualInputInfo.outputCalcAutoSteer = outputAutorunInfo.steerAngle;
  virtualInputInfo.outputSteer = outputAutorunInfo.realSteerAngle;
  virtualInputInfo.outputVelocity = outputAutorunInfo.gnssSpeed;
  virtualInputInfo.start = true;
  if (virtualWebSocket != null) {
    virtualWebSocket.send(
      JSON.stringify({
        type: "to-virtual-inputdata",
        payload: { virtualInputInfo },
      })
    );
  }
}, 33);
*/

// Detection info object for video-canvas rendering
const detectionInfo = {
  get detections() { return currentDetections; },
  get isEnabled() { return isInferenceEnabled; }
};

startCanvasRendering(
  canvasSonoki,
  videoElement,
  outputAutorunInfo,
  inputAutorunInfo,
  detectionInfo
);
