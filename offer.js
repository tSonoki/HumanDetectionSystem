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
// const signalingWebSocket = new WebSocket("ws://192.168.1.100:8080");
// const virtualWebSocket = new WebSocket("ws://localhost:9090/"); // エラーの原因①：WebSocketサーバーへの接続
let peerConnection;
let movieChannel;
let dataChannel;
const videoElement = document.getElementById("remote-video");
const canvasElement = document.getElementById("video-canvas");
const canvasSonoki = document.getElementById('video-canvas-sonoki');
const video = document.getElementById('remote-video');

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
let dynamicInterval = 100; // Start with 100ms (10 FPS) - 軽量化
let isInferenceBusy = false; // 推論処理中フラグ

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

        // Adaptive interval adjustment (より保守的)
        if (avgInferenceTime < 50) {
          dynamicInterval = Math.max(50, dynamicInterval - 5); // Up to 20 FPS
        } else if (avgInferenceTime < 100) {
          dynamicInterval = Math.max(100, dynamicInterval - 2); // Up to 10 FPS
        } else if (avgInferenceTime > 200) {
          dynamicInterval = Math.min(500, dynamicInterval + 25); // Down to 2 FPS
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
      setTimeout(inferenceLoop, dynamicInterval);
    } else {
      setTimeout(inferenceLoop, 100); // 推論オフ時は軽量チェック
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
    remoteStream.addTrack(event.track);
    videoElement.srcObject = remoteStream;
    console.log("OFFER: Video element srcObject set");

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

// 前回の値記録用
let prevFramesDecoded = null, prevFramesDecodedTime = null;
let prevFramesReceived = null, prevFramesReceivedTime = null;
let prevPacketsReceived = null, prevPacketsTime = null;
let prevBytesReceived = null, prevBytesTime = null;

// 統一されたログスキーマを作成する関数
function createUnifiedLogEntry() {
  const now = new Date();
  const isoTimestamp = now.toISOString();
  
  return {
    // 基本情報（共通）
    timestamp: isoTimestamp,
    time_formatted: now.toLocaleTimeString('ja-JP'),
    side: 'offer',
    session_id: peerConnection ? peerConnection._sessionId || 'unknown' : 'no_connection',
    
    // 接続状態（共通）
    connection_state: peerConnection ? peerConnection.connectionState : 'unknown',
    ice_connection_state: peerConnection ? peerConnection.iceConnectionState : 'unknown',
    ice_gathering_state: peerConnection ? peerConnection.iceGatheringState : 'unknown',
    
    // アプリケーション状態（共通）
    inference_enabled: isInferenceEnabled,
    canvas_visible: isCanvasVisible,
    
    // Video品質（Offer側：受信統計）
    frame_width: 0,
    frame_height: 0,
    frames_per_second: 0,
    frames_received: 0,
    frames_decoded: 0,
    frames_dropped: 0,
    frames_sent: 0, // Answer側で使用
    frames_encoded: 0, // Answer側で使用
    key_frames_decoded: 0,
    key_frames_encoded: 0, // Answer側で使用
    
    // 品質メトリクス
    actual_fps_received: 0,
    actual_fps_decoded: 0,
    actual_fps_sent: 0, // Answer側で使用
    actual_fps_encoded: 0, // Answer側で使用
    avg_decode_time_ms: 0,
    avg_encode_time_ms: 0, // Answer側で使用
    total_decode_time_ms: 0,
    total_encode_time_ms: 0, // Answer側で使用
    
    // ジッターバッファ（主にOffer側）
    jitter_buffer_delay_ms: 0,
    jitter_buffer_emitted_count: 0,
    avg_jitter_buffer_delay_ms: 0,
    
    // ネットワーク統計（共通）
    jitter_ms: 0,
    rtt_ms: 0,
    packets_received: 0,
    packets_sent: 0, // Answer側で使用
    packets_lost: 0,
    bytes_received: 0,
    bytes_sent: 0, // Answer側で使用
    header_bytes_received: 0,
    packets_per_second: 0,
    bitrate_kbps: 0,
    target_bitrate: 0, // Answer側で使用
    available_outgoing_bitrate: 0,
    
    // エラー統計（共通）
    fir_count: 0,
    pli_count: 0,
    nack_count: 0,
    retransmitted_packets_sent: 0, // Answer側で使用
    retransmitted_bytes_sent: 0, // Answer側で使用
    
    // ONNX推論統計（共通）
    avg_inference_time_ms: 0,
    total_inferences: 0,
    skipped_frames_inference: 0,
    skip_rate_percent: 0,
    min_inference_interval_ms: 0,
    
    // 検出結果統計（共通）
    detections_count: 0,
    detections_person_count: 0,
    max_confidence: 0,
    avg_confidence: 0
  };
}

setInterval(async function collectDetailedWebRTCStats() {
  if (!peerConnection) return;
  const stats = await peerConnection.getStats();

  // 統一スキーマでログエントリを作成
  let logEntry = createUnifiedLogEntry();

  let inboundRtpReport, candidatePairReport;
  
  stats.forEach((report) => {
    if (report.type === "inbound-rtp" && report.kind === "video" && !report.isRemote) {
      inboundRtpReport = report;
    } else if (report.type === "candidate-pair" && report.state === "succeeded") {
      candidatePairReport = report;
    }
  });

  // ONNX推論統計を追加
  if (onnxEngine) {
    const perfStats = onnxEngine.getPerformanceStats();
    logEntry.avg_inference_time_ms = perfStats.averageTime || 0;
    logEntry.total_inferences = perfStats.totalInferences || 0;
    logEntry.skipped_frames_inference = perfStats.skippedFrames || 0;
    logEntry.skip_rate_percent = perfStats.skipRate || 0;
    logEntry.min_inference_interval_ms = onnxEngine.minInferenceInterval || 0;
  }

  // 現在の検出結果統計を追加
  if (currentDetections && currentDetections.length > 0) {
    logEntry.detections_count = currentDetections.length;
    logEntry.detections_person_count = currentDetections.filter(d => d.classId === 0).length;
    const confidences = currentDetections.map(d => d.confidence);
    logEntry.max_confidence = Math.max(...confidences);
    logEntry.avg_confidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }

  // Video品質とデコーディング統計
  if (inboundRtpReport) {
    const ts = inboundRtpReport.timestamp;
    
    logEntry.frame_width = inboundRtpReport.frameWidth || 0;
    logEntry.frame_height = inboundRtpReport.frameHeight || 0;
    logEntry.frames_per_second = inboundRtpReport.framesPerSecond || 0;
    logEntry.frames_decoded = inboundRtpReport.framesDecoded || 0;
    logEntry.frames_received = inboundRtpReport.framesReceived || 0;
    logEntry.frames_dropped = inboundRtpReport.framesDropped || 0;
    logEntry.key_frames_decoded = inboundRtpReport.keyFramesDecoded || 0;
    logEntry.total_decode_time_ms = inboundRtpReport.totalDecodeTime ? 
      parseFloat((inboundRtpReport.totalDecodeTime * 1000).toFixed(3)) : 0;
    logEntry.avg_decode_time_ms = (inboundRtpReport.totalDecodeTime && inboundRtpReport.framesDecoded > 0) ? 
      parseFloat(((inboundRtpReport.totalDecodeTime / inboundRtpReport.framesDecoded) * 1000).toFixed(3)) : 0;
    logEntry.jitter_buffer_delay_ms = inboundRtpReport.jitterBufferDelay ? 
      parseFloat((inboundRtpReport.jitterBufferDelay * 1000).toFixed(3)) : 0;
    logEntry.jitter_buffer_emitted_count = inboundRtpReport.jitterBufferEmittedCount || 0;
    logEntry.avg_jitter_buffer_delay_ms = (inboundRtpReport.jitterBufferDelay && inboundRtpReport.jitterBufferEmittedCount > 0) ?
      parseFloat(((inboundRtpReport.jitterBufferDelay / inboundRtpReport.jitterBufferEmittedCount) * 1000).toFixed(3)) : 0;

    // ネットワーク統計
    logEntry.jitter_ms = inboundRtpReport.jitter ? 
      parseFloat((inboundRtpReport.jitter * 1000).toFixed(3)) : 0;
    logEntry.packets_received = inboundRtpReport.packetsReceived || 0;
    logEntry.packets_lost = inboundRtpReport.packetsLost || 0;
    logEntry.bytes_received = inboundRtpReport.bytesReceived || 0;
    logEntry.header_bytes_received = inboundRtpReport.headerBytesReceived || 0;
    logEntry.fir_count = inboundRtpReport.firCount || 0;
    logEntry.pli_count = inboundRtpReport.pliCount || 0;
    logEntry.nack_count = inboundRtpReport.nackCount || 0;

    // フレームレート計算
    if (inboundRtpReport.framesReceived !== undefined) {
      if (prevFramesReceived !== null && prevFramesReceivedTime !== null) {
        const deltaTimeSec = (ts - prevFramesReceivedTime) / 1000;
        const deltaFrames = inboundRtpReport.framesReceived - prevFramesReceived;
        if (deltaTimeSec > 0) {
          logEntry.actual_fps_received = parseFloat((deltaFrames / deltaTimeSec).toFixed(3));
        }
      }
      prevFramesReceived = inboundRtpReport.framesReceived;
      prevFramesReceivedTime = ts;
    }

    if (inboundRtpReport.framesDecoded !== undefined) {
      if (prevFramesDecoded !== null && prevFramesDecodedTime !== null) {
        const deltaTimeSec = (ts - prevFramesDecodedTime) / 1000;
        const deltaFrames = inboundRtpReport.framesDecoded - prevFramesDecoded;
        if (deltaTimeSec > 0) {
          logEntry.actual_fps_decoded = parseFloat((deltaFrames / deltaTimeSec).toFixed(3));
        }
      }
      prevFramesDecoded = inboundRtpReport.framesDecoded;
      prevFramesDecodedTime = ts;
    }

    // パケットレート・ビットレート計算
    if (inboundRtpReport.packetsReceived !== undefined) {
      if (prevPacketsReceived !== null && prevPacketsTime !== null) {
        const deltaTimeSec = (ts - prevPacketsTime) / 1000;
        const deltaPackets = inboundRtpReport.packetsReceived - prevPacketsReceived;
        if (deltaTimeSec > 0) {
          logEntry.packets_per_second = parseFloat((deltaPackets / deltaTimeSec).toFixed(3));
        }
      }
      prevPacketsReceived = inboundRtpReport.packetsReceived;
      prevPacketsTime = ts;
    }

    if (inboundRtpReport.bytesReceived !== undefined) {
      if (prevBytesReceived !== null && prevBytesTime !== null) {
        const deltaTimeSec = (ts - prevBytesTime) / 1000;
        const deltaBytes = inboundRtpReport.bytesReceived - prevBytesReceived;
        if (deltaTimeSec > 0) {
          logEntry.bitrate_kbps = parseFloat(((deltaBytes * 8) / 1000 / deltaTimeSec).toFixed(3));
        }
      }
      prevBytesReceived = inboundRtpReport.bytesReceived;
      prevBytesTime = ts;
    }
  }

  // RTT情報
  if (candidatePairReport) {
    logEntry.rtt_ms = candidatePairReport.currentRoundTripTime ? 
      parseFloat((candidatePairReport.currentRoundTripTime * 1000).toFixed(3)) : 0;
    logEntry.available_outgoing_bitrate = candidatePairReport.availableOutgoingBitrate || 0;
  }

  // 統一ログに保存
  webrtcStatsLogs.push(logEntry);
  
  // メモリ使用量制限（最新1000エントリまで保持）
  if (webrtcStatsLogs.length > 1000) {
    webrtcStatsLogs.splice(0, webrtcStatsLogs.length - 1000);
  }
}, 1000);

// 統一WebRTC統計のCSV出力機能
function saveDetailedWebRTCStats() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const pad = n => n.toString().padStart(2, "0");
  const ts = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}_${pad(jst.getUTCHours())}-${pad(jst.getUTCMinutes())}-${pad(jst.getUTCSeconds())}`;

  if (webrtcStatsLogs.length > 0) {
    const headers = Object.keys(webrtcStatsLogs[0]);
    const csv = [
      headers.join(","),
      ...webrtcStatsLogs.map(row => headers.map(h => row[h] ?? "").join(","))
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offer_webrtc_unified_stats_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log(`統一WebRTC統計を保存: ${webrtcStatsLogs.length}エントリ (${ts})`);
  } else {
    console.log("保存する統計データがありません");
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
