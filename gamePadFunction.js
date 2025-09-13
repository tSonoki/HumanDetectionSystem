//Gamepadを読み込んで、Autorunのほしい形に変換する関数
export function gamepadToAutorunInfo() {
  //let ptoCount = 0;
  const state = {
    ptoCount: 0,
    ptoFlag: false,
    upGearFlag: false,
    downGearFlag: false,
    upLinkFlag: false,
    downLinkFlag: false,
    speedUpFlag: false,
    speedDownFlag: false,
    remoteButtonFlag: false,
    setRemoteControl: false,
    maxUpLinkCount: 0,
    minDownLinkCount: 0,
  };

  function updateGamepadToAutorunInfo(toAutorunJson, gamePadJson) {
    const monitorRate = 240; //Monitorのフレームレート
    //Controller free zone tuning
    toAutorunJson.inputSteer = Math.floor(gamePadJson.axes[0] * 100);
    if (toAutorunJson.inputSteer > 70) {
      toAutorunJson.inputSteer = 70;
    } else if (toAutorunJson.inputSteer < -70) {
      toAutorunJson.inputSteer = -70;
    }
    toAutorunJson.inputEngineCycle =
      Math.floor(gamePadJson.axes[2] * 1000 - 1000) * -1 + 800;

    if (gamePadJson.buttons[2].pressed == true) {
      toAutorunJson.inputShuttle = 1;
    } else if (gamePadJson.buttons[0].pressed == true) {
      toAutorunJson.inputShuttle = -1;
    } else if (gamePadJson.buttons[1].pressed == true) {
      toAutorunJson.inputShuttle = 0;
    }

    if (gamePadJson.buttons[3].pressed == true) {
      state.ptoFlag = true;
      state.ptoCount += 1;
      toAutorunJson.inputPtoOn = 0;
    } else if (
      gamePadJson.buttons[3].pressed == false &&
      state.ptoFlag == true
    ) {
      state.ptoCount = 0;
      state.ptoFlag = false;
    }
    if (state.ptoCount > monitorRate) {
      toAutorunJson.inputPtoOn = 1;
    }

    if (gamePadJson.buttons[8].pressed == true) {
      toAutorunJson.inputHorn = 1;
    } else if (gamePadJson.buttons[8].pressed == false) {
      toAutorunJson.inputHorn = 0;
    }

    if (gamePadJson.buttons[4].pressed == true) {
      state.upGearFlag = true;
    } else if (
      gamePadJson.buttons[4].pressed == false &&
      state.upGearFlag == true
    ) {
      toAutorunJson.inputGear += 1;
      state.upGearFlag = false;
      if (toAutorunJson.inputGear > 8) {
        toAutorunJson.inputGear = 8;
      }
    }

    if (gamePadJson.buttons[5].pressed == true) {
      state.downGearFlag = true;
    } else if (
      gamePadJson.buttons[5].pressed == false &&
      state.downGearFlag == true
    ) {
      toAutorunJson.inputGear -= 1;
      state.downGearFlag = false;
      if (toAutorunJson.inputGear < 1) {
        toAutorunJson.inputGear = 1;
      }
    }

    if (gamePadJson.axes[9] == -1) {
      state.upLinkFlag = true;
      state.maxUpLinkCount += 1;
    } else if (
      Math.round(gamePadJson.axes[9] * 10) / 10 == 1.3 &&
      state.upLinkFlag == true
    ) {
      state.maxUpLinkCount = 0;
      state.upLinkFlag = false;
      toAutorunJson.inputPtoHeight += 5;
      if (toAutorunJson.inputPtoHeight > 100) {
        toAutorunJson.inputPtoHeight = 100;
      }
    }
    if (state.maxUpLinkCount > monitorRate) {
      state.maxUpLinkCount = 0;
      toAutorunJson.inputPtoHeight = 100;
    }
    if (
      Math.round(gamePadJson.axes[9] * 10) / 10 == 1.3 &&
      state.maxUpLinkCount != 0
    ) {
      state.maxUpLinkCount = 0;
    }

    if (Math.floor(gamePadJson.axes[9] * 10) / 10 == 0.1) {
      state.downLinkFlag = true;
      state.minDownLinkCount += 1;
    } else if (
      Math.round(gamePadJson.axes[9] * 10) / 10 == 1.3 &&
      state.downLinkFlag == true
    ) {
      state.minDownLinkCount = 0;
      state.downLinkFlag = false;
      toAutorunJson.inputPtoHeight -= 5;
      if (toAutorunJson.inputPtoHeight < 0) {
        toAutorunJson.inputPtoHeight = 0;
      }
    }
    if (state.minDownLinkCount > monitorRate) {
      state.minDownLinkCount = 0;
      toAutorunJson.inputPtoHeight = 0;
    }
    if (
      Math.round(gamePadJson.axes[9] * 10) / 10 == 1.3 &&
      state.minDownLinkCount != 0
    ) {
      state.minDownLinkCount = 0;
    }

    if (gamePadJson.buttons[21].pressed == true) {
      state.speedUpFlag = true;
    } else if (
      gamePadJson.buttons[21].pressed == false &&
      state.speedUpFlag == true
    ) {
      state.speedUpFlag = false;
      toAutorunJson.inputSpeed += 0.5;
      Math.floor(toAutorunJson.inputSpeed * 10) / 10;
      if (toAutorunJson.inputSpeed > 10) {
        toAutorunJson.inputSpeed = 10;
      }
    }
    if (gamePadJson.buttons[22].pressed == true) {
      state.speedDownFlag = true;
    } else if (
      gamePadJson.buttons[22].pressed == false &&
      state.speedDownFlag == true
    ) {
      state.speedDownFlag = false;
      toAutorunJson.inputSpeed -= 0.5;
      Math.floor(Math.floor(toAutorunJson.inputSpeed * 10) / 10);
      if (toAutorunJson.inputSpeed < 0) {
        toAutorunJson.inputSpeed = 0;
      }
    }

    if (gamePadJson.buttons[23].pressed == true) {
      state.remoteButtonFlag = true;
    }
    if (
      gamePadJson.buttons[23].pressed == false &&
      state.remoteButtonFlag == true
    ) {
      state.remoteButtonFlag = false;
      if (state.setRemoteControl === false) {
        toAutorunJson.inputGear = 1;
        toAutorunJson.inputPtoOn = 0;
        toAutorunJson.inputPtoHeight = 100;
        toAutorunJson.inputShuttle = 0;
        toAutorunJson.inputSpeed = 0;
        toAutorunJson.isRemoteCont = 1;
        state.setRemoteControl = true;
      } else if (state.setRemoteControl === true) {
        toAutorunJson.isRemoteCont = 0;
        toAutorunJson.isAutoRunStart = 0;
        state.setRemoteControl = false;
      }
      //console.log(document.getElementById("obs-det-inremote").checked);
      /*toAutorunJson.isUseSafetySensorInTeleDrive = Number(
        document.getElementById("obs-det-inremote").checked
      );*/
    }
    console.log(toAutorunJson);
    return toAutorunJson;
  }
  return updateGamepadToAutorunInfo;
}

export function drawGamepadInfo(toAutorunJson) {
  //HTMLに表示
  document.getElementById("set-steer").textContent = toAutorunJson.inputSteer;
  document.getElementById("set-rpm").textContent =
    toAutorunJson.inputEngineCycle;
  document.getElementById("set-gear").textContent = toAutorunJson.inputGear;
  document.getElementById("set-shuttle").textContent =
    toAutorunJson.inputShuttle;
  document.getElementById("set-speed").textContent = toAutorunJson.inputSpeed;
  document.getElementById("set-link-height").textContent =
    toAutorunJson.inputPtoHeight;
  document.getElementById("set-pto").textContent = toAutorunJson.inputPtoOn;
  document.getElementById("set-horn").textContent = toAutorunJson.inputHorn;
  document.getElementById("set-remote-cont").textContent =
    toAutorunJson.isRemoteCont;
}

export function farminGamepadToAutorunInfo() {
  //let ptoCount = 0;
  const state = {
    ptoCount: 0,
    ptoFlag: false,
    upGearFlag: false,
    downGearFlag: false,
    upLinkFlag: false,
    downLinkFlag: false,
    speedUpFlag: false,
    speedDownFlag: false,
    remoteButtonFlag: false,
    setRemoteControl: false,
    maxUpLinkCount: 0,
    minDownLinkCount: 0,
  };

  function updateFarmingGamepadToAutorunInfo(
    toAutorunJson,
    farminGamePadsJson
  ) {
    const monitorRate = 240; //Monitorのフレームレート
    const farmingGamepadHandle = farminGamePadsJson[0];
    const farmingGamepadPanel = farminGamePadsJson[1];
    //Controller free zone tuning
    const steerValue = farmingGamepadHandle.axes[0]; // そのまま小数値を使用
    const steerDeadzone = 0.09;
    const maxDeg = 35;
    const steerGamma = 2.5;

    toAutorunJson.inputSteer = Math.floor(
      Math.abs(steerValue) <= steerDeadzone
        ? 0
        : Math.abs(steerValue) >= 0.5
        ? steerValue > 0
          ? maxDeg
          : -maxDeg
        : (steerValue > 0 ? 1 : -1) *
          maxDeg *
          Math.pow(
            (Math.abs(steerValue) - steerDeadzone) / (0.5 - steerDeadzone),
            steerGamma
          )
    );

    toAutorunJson.inputEngineCycle =
      Math.floor(farmingGamepadHandle.axes[7] * 1000 + 1000) + 800;

    if (farmingGamepadHandle.buttons[0].pressed == true) {
      toAutorunJson.inputShuttle = 1;
    } else if (farmingGamepadHandle.buttons[2].pressed == true) {
      toAutorunJson.inputShuttle = -1;
    } else if (farmingGamepadHandle.buttons[4].pressed == true) {
      toAutorunJson.inputShuttle = 0;
    }

    if (farmingGamepadHandle.buttons[5].pressed == true) {
      state.ptoFlag = true;
      state.ptoCount += 1;
      toAutorunJson.inputPtoOn = 0;
    } else if (
      farmingGamepadHandle.buttons[5].pressed == false &&
      state.ptoFlag == true
    ) {
      state.ptoCount = 0;
      state.ptoFlag = false;
    }
    if (state.ptoCount > monitorRate) {
      toAutorunJson.inputPtoOn = 1;
    }

    if (farmingGamepadHandle.buttons[6].pressed == true) {
      toAutorunJson.inputHorn = 1;
    } else if (farmingGamepadHandle.buttons[6].pressed == false) {
      toAutorunJson.inputHorn = 0;
    }

    if (farmingGamepadHandle.buttons[15].pressed == true) {
      state.upGearFlag = true;
    } else if (
      farmingGamepadHandle.buttons[15].pressed == false &&
      state.upGearFlag == true
    ) {
      toAutorunJson.inputGear += 1;
      state.upGearFlag = false;
      if (toAutorunJson.inputGear > 8) {
        toAutorunJson.inputGear = 8;
      }
    }

    if (farmingGamepadHandle.buttons[16].pressed == true) {
      state.downGearFlag = true;
    } else if (
      farmingGamepadHandle.buttons[16].pressed == false &&
      state.downGearFlag == true
    ) {
      toAutorunJson.inputGear -= 1;
      state.downGearFlag = false;
      if (toAutorunJson.inputGear < 1) {
        toAutorunJson.inputGear = 1;
      }
    }

    if (Math.round(farmingGamepadHandle.axes[9] * 100) == -100) {
      state.upLinkFlag = true;
      state.maxUpLinkCount += 1;
    } else if (
      Math.round(farmingGamepadHandle.axes[9] * 100) == 329 &&
      state.upLinkFlag == true
    ) {
      state.maxUpLinkCount = 0;
      state.upLinkFlag = false;
      toAutorunJson.inputPtoHeight += 5;
      if (toAutorunJson.inputPtoHeight > 100) {
        toAutorunJson.inputPtoHeight = 100;
      }
    }
    if (state.maxUpLinkCount > monitorRate) {
      state.maxUpLinkCount = 0;
      toAutorunJson.inputPtoHeight = 100;
    }
    if (
      Math.round(farmingGamepadHandle.axes[9] * 100) == 329 &&
      state.maxUpLinkCount != 0
    ) {
      state.maxUpLinkCount = 0;
    }

    if (Math.round(farmingGamepadHandle.axes[9] * 100) == 14) {
      state.downLinkFlag = true;
      state.minDownLinkCount += 1;
    } else if (
      Math.round(farmingGamepadHandle.axes[9] * 100) == 329 &&
      state.downLinkFlag == true
    ) {
      state.minDownLinkCount = 0;
      state.downLinkFlag = false;
      toAutorunJson.inputPtoHeight -= 5;
      if (toAutorunJson.inputPtoHeight < 0) {
        toAutorunJson.inputPtoHeight = 0;
      }
    }
    if (state.minDownLinkCount > monitorRate) {
      state.minDownLinkCount = 0;
      toAutorunJson.inputPtoHeight = 0;
    }
    if (
      Math.round(farmingGamepadHandle.axes[9] * 100) == 329 &&
      state.minDownLinkCount != 0
    ) {
      state.minDownLinkCount = 0;
    }

    console.log(Math.round(farmingGamepadHandle.axes[9] * 100));

    /*if (farmingGamepadHandle.buttons[21].pressed == true) {
      state.speedUpFlag = true;
    } else if (
      gamePadJson.buttons[21].pressed == false &&
      state.speedUpFlag == true
    ) {
      state.speedUpFlag = false;
      toAutorunJson.inputSpeed += 0.5;
      Math.floor(toAutorunJson.inputSpeed * 10) / 10;
      if (toAutorunJson.inputSpeed > 10) {
        toAutorunJson.inputSpeed = 10;
      }
    }
    if (gamePadJson.buttons[22].pressed == true) {
      state.speedDownFlag = true;
    } else if (
      gamePadJson.buttons[22].pressed == false &&
      state.speedDownFlag == true
    ) {
      state.speedDownFlag = false;
      toAutorunJson.inputSpeed -= 0.5;
      Math.floor(Math.floor(toAutorunJson.inputSpeed * 10) / 10);
      if (toAutorunJson.inputSpeed < 0) {
        toAutorunJson.inputSpeed = 0;
      }
    }*/

    const setSpeedKmh =
      Math.floor((farmingGamepadPanel.axes[3] * 2.5 + 2.5) * 10) / 10;
    const setSpeedMps = setSpeedKmh / 3.6;
    toAutorunJson.inputSpeed = setSpeedMps;

    if (farmingGamepadPanel.buttons[29].pressed == true) {
      state.remoteButtonFlag = true;
    }
    if (
      farmingGamepadPanel.buttons[29].pressed == false &&
      state.remoteButtonFlag == true
    ) {
      state.remoteButtonFlag = false;
      if (state.setRemoteControl === false) {
        toAutorunJson.inputGear = 1;
        toAutorunJson.inputPtoOn = 0;
        toAutorunJson.inputPtoHeight = 100;
        toAutorunJson.inputShuttle = 0;
        toAutorunJson.inputSpeed = 0;
        toAutorunJson.isRemoteCont = 1;
        state.setRemoteControl = true;
      } else if (state.setRemoteControl === true) {
        toAutorunJson.isRemoteCont = 0;
        toAutorunJson.isAutoRunStart = 0;
        state.setRemoteControl = false;
      }
      //console.log(document.getElementById("obs-det-inremote").checked);
      /*toAutorunJson.isUseSafetySensorInTeleDrive = Number(
        document.getElementById("obs-det-inremote").checked
      );*/
    }
    //console.log(toAutorunJson);
    return toAutorunJson;
  }
  return updateFarmingGamepadToAutorunInfo;
}
