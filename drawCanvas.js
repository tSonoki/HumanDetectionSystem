// simple-canvas-renderer.js

let animationId = null;

/**
 * シンプルなCanvas描画開始
 * @param {HTMLCanvasElement} canvas - 2Dのcanvas要素
 * @param {HTMLVideoElement} video - WebRTCからの映像
 * @param {Object} robotInfo - 遠隔から更新される情報
 * @param {Object} controlInfo - ゲームパッドの情報
 * @param {Object} detectionInfo - 推論検出結果（optional）
 */
export function startCanvasRendering(canvas, video, robotInfo, controlInfo, detectionInfo = null) {
  const context2d = canvas.getContext("2d");

  // Canvas設定
  canvas.width = 1920;
  canvas.height = 1080;
  canvas.hidden = true;

  function render() {
    // 隠れてる時はスキップ
    if (canvas.hidden) {
      animationId = requestAnimationFrame(render);
      return;
    }

    // 映像チェック
    if (!video || video.readyState < 2) {
      animationId = requestAnimationFrame(render);
      return;
    }

    // 描画
    drawFrame(context2d, video, robotInfo, controlInfo, detectionInfo);
    animationId = requestAnimationFrame(render);
  }

  // 開始
  animationId = requestAnimationFrame(render);

  // フルスクリーン制御
  setupFullscreen(canvas);

  return {
    stop: () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    },
  };
}

function drawFrame(context2d, video, robotInfo, controlInfo, detectionInfo) {
  // 映像描画
  context2d.drawImage(video, 0, 0, 1920, 1080);

  // 推論結果描画（映像の上、UIの下）
  if (detectionInfo && detectionInfo.detections && detectionInfo.isEnabled) {
    drawDetections(context2d, detectionInfo.detections);
  }

  // モード表示
  if (controlInfo.isRemoteCont) {
    drawTeleMode(context2d, robotInfo);
  } else {
    drawAutoMode(context2d);
  }

  // 共通UI
  drawCommonUI(context2d, robotInfo, controlInfo);
}

function drawAutoMode(context2d) {
  context2d.setLineDash([]);
  context2d.lineWidth = 2;
  context2d.fillStyle = "red";
  context2d.font = "Italic 80px serif";
  context2d.fillText("AutoDriving Mode", 10, 1060);
  context2d.strokeStyle = "magenta";
  context2d.strokeText("AutoDriving Mode", 10, 1060);
}

function drawTeleMode(context2d, robotInfo) {
  // ヘディングエラーライン
  let headingError = Math.max(-90, Math.min(90, robotInfo.headingError || 0));
  let headPix =
    960 - Math.floor(1060 * Math.sin(headingError * (Math.PI / 180)));

  context2d.beginPath();
  context2d.strokeStyle = "cyan";
  context2d.lineWidth = 10;
  context2d.setLineDash([10, 10]);
  context2d.moveTo(960, 1060);
  context2d.lineTo(headPix, 320);
  context2d.stroke();

  // モードテキスト
  context2d.setLineDash([]);
  context2d.lineWidth = 2;
  context2d.fillStyle = "red";
  context2d.font = "Italic 80px serif";
  context2d.fillText("TeleDriving Mode", 10, 1060);
  context2d.strokeStyle = "magenta";
  context2d.strokeText("TeleDriving Mode", 10, 1060);

  // 横方向エラー
  context2d.fillStyle = "blue";
  const lateralErrorText =
    "Lateral Error : " +
    Math.floor((robotInfo.lateralError || 0) * 100) +
    " cm";
  context2d.fillText(lateralErrorText, 1200, 1060);
  context2d.strokeStyle = "cyan";
  context2d.strokeText(lateralErrorText, 1200, 1060);
}

function drawCommonUI(context2d, robotInfo, controlInfo) {
  context2d.font = "Italic 48px serif";
  context2d.lineWidth = 2;
  context2d.fillStyle = "white";
  context2d.strokeStyle = "magenta";

  // 速度
  const speedText = "Speed : " + (robotInfo.gnssSpeed || 0) + " km/h";
  context2d.fillText(speedText, 10, 50);
  context2d.strokeText(speedText, 10, 50);

  // リモート制御時の詳細
  if (controlInfo.isRemoteCont) {
    const ptoStatus = controlInfo.inputPtoOn ? "ON" : "OFF";

    drawText(
      context2d,
      "Hitch Height : " + (controlInfo.inputPtoHeight || 0) + "%",
      1470,
      50
    );
    drawText(context2d, "PTO : " + ptoStatus, 1470, 105);
    drawText(
      context2d,
      "Shuttle : " + (controlInfo.inputShuttle || 0),
      10,
      165
    );
    drawText(
      context2d,
      "Set Speed : " + (controlInfo.inputSpeed || 0) + " km/h",
      10,
      105
    );
  }

  // 距離マーカー
  context2d.font = "Italic 64px serif";
  context2d.fillStyle = "yellow";
  context2d.strokeStyle = "orange";

  drawText(context2d, "10m", 10, 400);
  drawText(context2d, "5m", 30, 720);
  drawText(context2d, "3m", 200, 820);

  // ガイドライン
  drawGuidelines(context2d);
}

function drawText(context2d, text, x, y) {
  context2d.fillText(text, x, y);
  context2d.strokeText(text, x, y);
}

function drawDetections(context2d, detections) {
  if (!detections || detections.length === 0) return;

  // Scale factors from 640x640 model input to 1920x1080 canvas
  const scaleX = 1920 / 640;
  const scaleY = 1080 / 640;

  // COCO class names
  const classNames = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
    "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop",
    "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
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

    // Save current context state
    context2d.save();

    // Draw bounding box
    context2d.strokeStyle = boxColor;
    context2d.lineWidth = 6;
    context2d.setLineDash([]);
    context2d.strokeRect(x, y, width, height);

    // Prepare label text
    const className = classNames[detection.classId] || `Class ${detection.classId}`;
    const confidence = (detection.confidence * 100).toFixed(1);
    const label = `${className} ${confidence}%`;

    // Set font and measure text
    context2d.font = "bold 32px Arial";
    const textMetrics = context2d.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 40;

    // Calculate label position
    const labelX = Math.max(0, x);
    const labelY = Math.max(textHeight, y);

    // Draw label background
    context2d.fillStyle = boxColor;
    context2d.fillRect(
      labelX,
      labelY - textHeight,
      textWidth + 16,
      textHeight + 8
    );

    // Draw label text
    context2d.fillStyle = "white";
    context2d.fillText(label, labelX + 8, labelY - 8);

    // Restore context state
    context2d.restore();
  });
}

function drawGuidelines(context2d) {
  // 前方監視線
  context2d.beginPath();
  context2d.strokeStyle = "black";
  context2d.setLineDash([10, 10]);
  context2d.lineWidth = 5;
  context2d.moveTo(860, 370);
  context2d.lineTo(1060, 370);
  context2d.stroke();

  // 中央線
  context2d.beginPath();
  context2d.strokeStyle = "white";
  context2d.moveTo(960, 1060);
  context2d.lineTo(960, 370);
  context2d.lineWidth = 5;
  context2d.setLineDash([5, 5, 60, 5]);
  context2d.stroke();

  // エラーゾーン
  context2d.beginPath();
  context2d.setLineDash([5, 5, 10]);
  context2d.strokeStyle = "orange";
  context2d.moveTo(230, 710);
  context2d.quadraticCurveTo(960, 210, 1690, 710);
  context2d.strokeStyle = "red";
  context2d.moveTo(395, 790);
  context2d.quadraticCurveTo(960, 310, 1525, 790);
  context2d.stroke();
}

function setupFullscreen(canvas) {
  const trigger = document.getElementById("fullcanvas-trigger");
  if (!trigger) return;

  trigger.addEventListener("click", () => {
    canvas.hidden = false;
    canvas.requestFullscreen?.();
  });

  // フルスクリーン終了
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      canvas.hidden = true;
    }
  });
}

// メイン関数のみエクスポート
export default startCanvasRendering;
