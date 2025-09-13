export function onGamepadConnected(event) {
  console.log("Gamepad connected:", event.gamepad);
  //gamepadIndex = event.gamepad.index; // 最初に接続されたゲームパッドを記憶
  //requestAnimationFrame(updateGamepadStatus);
}

/**
 * ゲームパッドが切断されたときの処理
 */
export function onGamepadDisconnected(event) {
  console.log("Gamepad disconnected:", event.gamepad);
  /* if (gamepadIndex === event.gamepad.index) {
    gamepadIndex = null; // 監視をリセット
  }*/
}

function addgamepad(gamepad) {
  const d = document.createElement("div");
  d.setAttribute("id", `controller${gamepad.index}`);

  const t = document.createElement("h1");
  t.textContent = `gamepad: ${gamepad.id}`;
  d.append(t);

  const b = document.createElement("ul");
  b.className = "buttons";
  gamepad.buttons.forEach((button, i) => {
    const e = document.createElement("li");
    e.className = "button";
    e.textContent = `Button ${i}`;
    b.append(e);
  });

  d.append(b);

  const a = document.createElement("div");
  a.className = "axes";

  gamepad.axes.forEach((axis, i) => {
    const p = document.createElement("progress");
    p.className = "axis";
    p.setAttribute("max", "2");
    p.setAttribute("value", "1");
    p.textContent = i;
    a.append(p);
  });

  d.appendChild(a);

  // See https://github.com/luser/gamepadtest/blob/master/index.html
  const start = document.querySelector("#start");
  if (start) {
    start.style.display = "none";
  }

  document.body.append(d);
  if (!loopstarted) {
    requestAnimationFrame(updateStatus);
    loopstarted = true;
  }
}

function removegamepad(gamepad) {
  document.querySelector(`#controller${gamepad.index}`).remove();
}

function updateStatus() {
  for (const gamepad of navigator.getGamepads()) {
    if (!gamepad) continue;

    const d = document.getElementById(`controller${gamepad.index}`);
    const buttonElements = d.getElementsByClassName("button");
    console.log(gamepad);
    for (const [i, button] of gamepad.buttons.entries()) {
      const el = buttonElements[i];

      const pct = `${Math.round(button.value * 100)}%`;
      el.style.backgroundSize = `${pct} ${pct}`;
      if (button.pressed) {
        el.textContent = `Button ${i} [PRESSED]`;
        el.style.color = "#42f593";
        el.className = "button pressed";
      } else {
        el.textContent = `Button ${i}`;
        el.style.color = "#2e2d33";
        el.className = "button";
      }
    }

    const axisElements = d.getElementsByClassName("axis");
    for (const [i, axis] of gamepad.axes.entries()) {
      const el = axisElements[i];
      el.textContent = `${i}: ${axis.toFixed(4)}`;
      el.setAttribute("value", axis + 1);
    }
  }

  requestAnimationFrame(updateStatus);
}

export function getOrderedGamepads(rawGamepads) {
  const orderedGamepads = [null, null]; // [0] = ハンドル, [1] = パネル

  // 接続されたゲームパッドを検査
  for (let i = 0; i < rawGamepads.length; i++) {
    const gamepad = rawGamepads[i];
    if (!gamepad) continue;

    // ベンダーIDとプロダクトIDで判別
    const vendorMatch = gamepad.id.match(/Vendor: ([0-9a-f]+)/i);
    const productMatch = gamepad.id.match(/Product: ([0-9a-f]+)/i);

    if (vendorMatch && productMatch) {
      const vendorId = vendorMatch[1].toLowerCase();
      const productId = productMatch[1].toLowerCase();

      // HORI製品の判別
      if (vendorId === "0f0d") {
        if (productId === "0182") {
          // ステアリングコントローラー → 配列[0]
          orderedGamepads[0] = gamepad;
        } else if (productId === "0183") {
          // パネルコントローラー → 配列[1]
          orderedGamepads[1] = gamepad;
        }
      }
    }

    // 名前による判別（フォールバック）
    if (!orderedGamepads[0] && gamepad.id.includes("STEERING")) {
      orderedGamepads[0] = gamepad;
    }

    if (!orderedGamepads[1] && gamepad.id.includes("PANEL")) {
      orderedGamepads[1] = gamepad;
    }
  }
  //console.log("Ordered gamepads:", orderedGamepads);
  return orderedGamepads;
}
