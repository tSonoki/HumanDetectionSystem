// simple-canvas-renderer.js

let animationId = null;

/**
 * シンプルなCanvas描画開始
 * @param {HTMLCanvasElement} canvas - 2Dのcanvas要素
 * @param {HTMLVideoElement} video - WebRTCからの映像
 * @param {Object} robotInfo - 遠隔から更新される情報
 * @param {Object} controlInfo - ゲームパッドの情報
 */
export function startCanvasRendering(canvas, video, robotInfo, controlInfo) {
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
    drawFrame(context2d, video, robotInfo, controlInfo);
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

function drawFrame(context2d, video, robotInfo, controlInfo) {
  // 映像描画
  context2d.drawImage(video, 0, 0, 1920, 1080);

  // モード表示
  if (controlInfo.isRemoteCont) {
    drawTeleMode(context2d, robotInfo, controlInfo);
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

function drawTeleMode(context2d, robotInfo, controlInfo) {
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

  // 走行経路予測線を描画
  drawPathPrediction(context2d, robotInfo, controlInfo);

  // モードテキスト
  context2d.setLineDash([]);
  context2d.lineWidth = 2;
  context2d.fillStyle = "reda";
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

/**
 * 走行経路予測線を描画
 * @param {CanvasRenderingContext2D} context2d 
 * @param {Object} robotInfo - ロボット情報
 * @param {Object} controlInfo - 制御情報
 */
function drawPathPrediction(context2d, robotInfo, controlInfo) {
  // 現在の速度とステアリング角度を取得
  const currentSpeed = robotInfo.gnssSpeed || 0; // km/h
  const steeringAngle = controlInfo.inputSteering || 0; // 度数 (-100 to 100 など)
  const wheelBase = 2.5; // 車軸間距離（メートル）- 実際の値に調整してください
  
  // 予測時間（秒）
  const predictionTime = 3.0;
  const timeStep = 0.1;
  const steps = Math.floor(predictionTime / timeStep);
  
  // 速度をm/sに変換
  const speedMs = (currentSpeed * 1000) / 3600;
  
  // ステアリング角度を実際の舵角に変換（-30度〜30度の範囲と仮定）
  const maxSteerAngle = 30; // 度
  const actualSteerAngle = (steeringAngle / 100) * maxSteerAngle;
  const steerRad = actualSteerAngle * (Math.PI / 180);
  
  // 旋回半径を計算
  let turnRadius = Infinity;
  if (Math.abs(steerRad) > 0.001) {
    turnRadius = wheelBase / Math.tan(Math.abs(steerRad));
  }
  
  // 経路点を計算
  const pathPoints = [];
  let x = 0; // 車両中心からの相対位置
  let y = 0;
  let heading = 0; // 車両の向き（ラジアン）
  
  pathPoints.push({ x: 960, y: 1080 }); // 開始点（画面下中央）
  
  for (let i = 0; i < steps; i++) {
    const dt = timeStep;
    const distance = speedMs * dt;
    
    if (turnRadius === Infinity) {
      // 直進
      x += distance * Math.sin(heading);
      y += distance * Math.cos(heading);
    } else {
      // 旋回
      const angularVelocity = speedMs / turnRadius;
      const direction = steerRad > 0 ? 1 : -1;
      
      heading += angularVelocity * dt * direction;
      x += distance * Math.sin(heading);
      y += distance * Math.cos(heading);
    }
    
    // 画面座標に変換
    const screenX = 960 + x * 10; // スケール調整（1m = 10px）
    const screenY = 1080 - y * 10; // Y軸を反転
    
    // 画面内の点のみ追加
    if (screenY > 200 && screenY < 1080 && screenX > 0 && screenX < 1920) {
      pathPoints.push({ x: screenX, y: screenY });
    }
  }
  
  // 予測経路を描画
  if (pathPoints.length > 1) {
    context2d.beginPath();
    context2d.strokeStyle = "lime";
    context2d.lineWidth = 8;
    context2d.setLineDash([15, 5]);
    
    context2d.moveTo(pathPoints[0].x, pathPoints[0].y);
    for (let i = 1; i < pathPoints.length; i++) {
      context2d.lineTo(pathPoints[i].x, pathPoints[i].y);
    }
    context2d.stroke();
    
    // 予測経路の端点に矢印を描画
    if (pathPoints.length > 2) {
      const lastPoint = pathPoints[pathPoints.length - 1];
      const secondLastPoint = pathPoints[pathPoints.length - 2];
      drawArrow(context2d, secondLastPoint, lastPoint, "lime");
    }
  }
  
  // 危険予測ゾーンを描画
  drawDangerZone(context2d, pathPoints, turnRadius, steerRad);
}

/**
 * 矢印を描画
 * @param {CanvasRenderingContext2D} context2d 
 * @param {Object} from - 開始点 {x, y}
 * @param {Object} to - 終了点 {x, y}
 * @param {string} color - 色
 */
function drawArrow(context2d, from, to, color) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx);
  const arrowSize = 20;
  
  context2d.save();
  context2d.strokeStyle = color;
  context2d.fillStyle = color;
  context2d.lineWidth = 4;
  context2d.setLineDash([]);
  
  // 矢印の先端
  context2d.beginPath();
  context2d.moveTo(to.x, to.y);
  context2d.lineTo(
    to.x - arrowSize * Math.cos(angle - Math.PI / 6),
    to.y - arrowSize * Math.sin(angle - Math.PI / 6)
  );
  context2d.moveTo(to.x, to.y);
  context2d.lineTo(
    to.x - arrowSize * Math.cos(angle + Math.PI / 6),
    to.y - arrowSize * Math.sin(angle + Math.PI / 6)
  );
  context2d.stroke();
  
  context2d.restore();
}

/**
 * 危険予測ゾーンを描画
 * @param {CanvasRenderingContext2D} context2d 
 * @param {Array} pathPoints - 予測経路の点群
 * @param {number} turnRadius - 旋回半径
 * @param {number} steerRad - ステアリング角度（ラジアン）
 */
function drawDangerZone(context2d, pathPoints, turnRadius, steerRad) {
  if (pathPoints.length < 2) return;
  
  const vehicleWidth = 2.0; // 車両幅（メートル）
  const safetyMargin = 0.5; // 安全マージン（メートル）
  const totalWidth = (vehicleWidth + safetyMargin) * 10; // ピクセル変換
  
  context2d.save();
  context2d.strokeStyle = "rgba(255, 165, 0, 0.8)"; // オレンジ色
  context2d.fillStyle = "rgba(255, 165, 0, 0.2)";
  context2d.lineWidth = 3;
  context2d.setLineDash([10, 5]);
  
  // 左右の境界線を計算
  const leftBoundary = [];
  const rightBoundary = [];
  
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const current = pathPoints[i];
    const next = pathPoints[i + 1];
    
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > 0) {
      const unitX = dx / length;
      const unitY = dy / length;
      
      // 垂直方向のベクトル
      const perpX = -unitY;
      const perpY = unitX;
      
      const halfWidth = totalWidth / 2;
      
      leftBoundary.push({
        x: current.x + perpX * halfWidth,
        y: current.y + perpY * halfWidth
      });
      
      rightBoundary.push({
        x: current.x - perpX * halfWidth,
        y: current.y - perpY * halfWidth
      });
    }
  }
  
  // 境界線を描画
  if (leftBoundary.length > 1) {
    context2d.beginPath();
    context2d.moveTo(leftBoundary[0].x, leftBoundary[0].y);
    for (let i = 1; i < leftBoundary.length; i++) {
      context2d.lineTo(leftBoundary[i].x, leftBoundary[i].y);
    }
    context2d.stroke();
    
    context2d.beginPath();
    context2d.moveTo(rightBoundary[0].x, rightBoundary[0].y);
    for (let i = 1; i < rightBoundary.length; i++) {
      context2d.lineTo(rightBoundary[i].x, rightBoundary[i].y);
    }
    context2d.stroke();
  }
  
  context2d.restore();
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
    
    // ステアリング情報を追加表示
    drawText(
      context2d,
      "Steering : " + (controlInfo.inputSteering || 0) + "%",
      10,
      220
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
  const triggerId =
    canvas.id === "video-canvas-sonoki"
      ? "fullcanvas-trigger_sonoki"
      : "fullcanvas-trigger";

  const trigger = document.getElementById(triggerId);
  if (!trigger) return;

  trigger.addEventListener("click", () => {
    canvas.hidden = false;
    canvas.requestFullscreen?.();
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      canvas.hidden = true;
    }
  });
}


// メイン関数のみエクスポート
export default startCanvasRendering;