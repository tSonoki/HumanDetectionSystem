const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require("constants");

exports.makeCAN_proto = (gpdInfo) => {
  let CAN = Array(16).fill("0"); //CAN[8+8]の宣言

  /*if (typeof gpdInfo != "object") {
        return CAN;
    }*/

  CAN[0] = "00000010";

  //if (VehicleControl.SetSteer) {
  let steerpara = Math.floor(gpdInfo.setSteer * 1000 + 1000); //steer(-100~100) span(0.1)->(-1000~1000)
  //console.log(steerpara);
  if (steerpara > 1700) {
    steerpara = 1700;
  } else if (steerpara < 300) {
    steerpara = 300;
  }
  if (steerpara < 1082 && 918 < steerpara) {
    steerpara = 1000;
  }
  if (steerpara > 1082) {
    steerpara -= 82;
  } else if (steerpara < 918) {
    steerpara += 82;
  }
  let steercan = ("000000000000" + steerpara.toString(2)).slice(-12);
  //console.log(steercan);
  //};

  CAN[1] = steercan.substring(4, 12);
  let CAN2F = steercan.substring(0, 4);

  let rpmpara = Math.floor(gpdInfo.setRpm * -200);
  if (rpmpara > 200) {
    rpmpara = 200;
  } else if (rpmpara < 0) {
    rpmpara = 0;
  }
  //console.log(rpmpara);
  //let s_g = analyze_speed.Morita_function(VehicleControl.SetSpeed);

  let CAN2S = ("0000" + gpdInfo.setGear.toString(2)).slice(-4);
  CAN[2] = CAN2S + CAN2F;
  CAN[3] = ("00000000" + rpmpara.toString(2)).slice(-8);
  //console.log(`CAN[3] is ${CAN[3]}`);

  if (gpdInfo.setShuttle == "F") {
    CAN[4] = "00000001";
  } else if (gpdInfo.setShuttle == "R") {
    CAN[4] = "00000010";
  } else if (gpdInfo.setShuttle == "N") {
    CAN[4] = "00000000";
  }

  CAN[5] = "00000000";
  CAN[6] = "00000000";
  CAN[7] = "00000000";

  let CAN8F = "000"; //patright message
  let CAN8S = "0";
  if (gpdInfo.setHorn == false) {
    CAN8S = "0";
  } else if (gpdInfo.setHorn == true) {
    CAN8S = "1";
  }
  let CAN8T = "0";
  if (gpdInfo.setPto == false) {
    CAN8T = "0";
  } else if (gpdInfo.setPto == true) {
    CAN8T = "1";
  }
  let CAN8Q = "000";

  CAN[8] = CAN8Q + CAN8T + CAN8S + CAN8F;

  CAN[9] = ("00000000" + gpdInfo.setLinkHeight.toString(2)).slice(-8);

  CAN[10] = "00000000";
  CAN[11] = "00000000";
  CAN[12] = "00000000";
  CAN[13] = "00000000";
  CAN[14] = "00000000";
  CAN[15] = "00000000";

  let return_CAN = CAN.join(",");
  //console.log(return_CAN);
  return return_CAN;
};

exports.makeSeparetedCommaStr = (gpdInfo) => {
  let CommaStr = Array(9);
};

exports.makeAdjustCAN = (forAutorunInfo) => {
  let adjustCAN = Array(8).fill("0");
  //adjustCAN.fill("0");
  adjustCAN[0] = (forAutorunInfo.adjustSpeed * 10).toString(2);
  adjustCAN[1] = forAutorunInfo.adjustHitch.toString(2);
  adjustCAN[2] = String(Number(forAutorunInfo.adjustPto));
  let return_adjustCAN = adjustCAN.join(",");
  return return_adjustCAN;
};

exports.makeCAN_mover = (gpdMoverInfo) => {
  console.log("kaihatutyu");
  var setMMMassage = gpdMoverInfo.setJoyX.toString(2); // + +;
  return setMMMassage;
};

exports.makeMessageMR1000A = (mr1000aObj) => {
  console.log(mr1000aObj);
  var mr1000AMassage =
    mr1000aObj.inputSteer.toString() +
    "," +
    mr1000aObj.inputEngineCycle.toString() +
    "," +
    mr1000aObj.inputGear.toString() +
    "," +
    mr1000aObj.inputShuttle.toString() +
    "," +
    mr1000aObj.inputSpeed.toString() +
    "," +
    mr1000aObj.inputPtoHeight.toString() +
    "," +
    mr1000aObj.inputPtoOn.toString() +
    "," +
    mr1000aObj.inputHorn.toString() +
    "," +
    mr1000aObj.isRemoteCont.toString() +
    "," +
    mr1000aObj.isAutoRunStart.toString() +
    "," +
    "5" +
    "," +
    mr1000aObj.isUseSafetySensorInTeleDrive.toString() +
    "\n";
  console.log(mr1000AMassage);
  return mr1000AMassage;
};

exports.parseMR1000AMessage = (mr1000aMessage) => {
  let mr1000aMessageArray = mr1000aMessage.split(",");
  let mr1000aReceiveInfo = {
    lat: mr1000aMessageArray[0],
    lon: mr1000aMessageArray[1],
    gnssQuality: mr1000aMessageArray[2],
    gnssSpeed: mr1000aMessageArray[3],
    heading: mr1000aMessageArray[4],
    headingError: mr1000aMessageArray[5],
    lateralError: mr1000aMessageArray[6],
    steerAngle: mr1000aMessageArray[7],
    realSteerAngle: mr1000aMessageArray[8],
    stopStatus: mr1000aMessageArray[9].split("\n")[0],
  };
  return mr1000aReceiveInfo;
};
//CAN[8]をつくろう
/*exports.makeCAN = (VehicleControl) => {

    let CAN = ["0", "0", "0", "0", "0", "0", "0", "0"];//CAN[8+8]の宣言

    var CAN0F = "0";

    //走行か停止の設定

    if (VehicleControl.ButtonSignal == "A") {
        CAN0F = '010';
    }
    else if (VehicleControl.ButtonSignal == "B") {
        CAN0F = '010';
    }
    else if (VehicleControl.ButtonSignal == "X") {
        CAN0F = '000';
    }
    else if (VehicleControl.ButtonSignal == "Y") {
        CAN0F = '110';
    }
    else if (VehicleControl.ButtonSignal == "EX1") {
        CAN0F = '000';
    }
    else if (VehicleControl.ButtonSignal == "EX2") {
        CAN0F = '000';
    }

    let CAN0S = "00000";

    CAN[0] = CAN0S + CAN0F;

    //if (VehicleControl.SetSteer) {
    //let steerpara = Math.floor(VehicleControl.SetSteer * 1000 + 1000); //steer(-100~100) span(0.1)->(-1000~1000)
    let steerpara = 1000;
    //console.log(steerpara);
    //let steerb = ;
    let steercan = ('000000000000' + steerpara.toString(2)).slice(-12);
    //console.log(steercan);

    //};

    CAN[1] = (steercan.substr(4, 12));
    let CAN2F = steercan.substr(0, 4);

    let s_g = analyze_speed.Morita_function(VehicleControl.SetSpeed);

    let CAN2S = ('0000' + (s_g.out_gear).toString(2)).slice(-4);
    CAN[2] = (CAN2S + CAN2F);
    CAN[3] = ('00000000' + (s_g.out_rpm).toString(2)).slice(-8);

    if (VehicleControl.ButtonSignal == "A") {
        CAN[4] = '00000001';
    }
    else if (VehicleControl.EXButtonSignal == "EX2") {
        CAN[4] = '00000010';
    }
    else if (VehicleControl.EXButtonSignal == "B") {
        CAN[4] = '00000000';
    }


    CAN[5] = '00000000';
    CAN[6] = '00000000';
    CAN[7] = '00000000';

    let return_CAN = CAN.join(',');
    return return_CAN;

}*/

exports.parseCAN = (message) => {
  if (typeof message == "string") {
    let parseString = message.split(",");
    //console.log(`Result of split is -> ${parseString}`);

    if (parseString[0] == "1") {
      let parseNum = [1, 0, 0, 0, 0, 0, 0, 0, 0];
      let binString = ["1", "0", "0", "0", "0", "0", "0", "0", "0"];
      let TractorInfo1 = {
        Info: 1,
        EngineRpm: 0,
        DpfLv: 0,
        EngineTemp: 0,
        EngineLoad: 0,
        FuelAmo: 0,
      };
      for (let i = 1; i <= 8; ++i) {
        parseNum[i] = parseInt(parseString[i], 10);
        //console.log(`parseNum[${i}] is ${parseNum[i]},type is ${typeof parseNum[i]}`);
        binString[i] = ("00000000" + parseNum[i].toString(2)).slice(-8);
        //console.log(`BinString[${i}] is ${BinString[i]},type is ${typeof BinString[i]}`);
      }

      //console.log(`Result of parseInt -> ${parseString}`);
      //console.log(`Result of toString -> ${BinString}`);

      let EngRpmBin = binString[2].substring(0, 4) + binString[1];
      //console.log(EngRpmBin);
      let DpfLvBin = binString[2].substring(4, 8);
      let EngTempBin = binString[3];
      let EngLoadBin = binString[4];
      let FuelAmoBin = binString[5];

      TractorInfo1.EngineRpm = parseInt(EngRpmBin, 2);
      TractorInfo1.DpfLv = parseInt(DpfLvBin, 2);
      TractorInfo1.EngineTemp = parseInt(EngTempBin, 2) - 40;
      TractorInfo1.EngineLoad = parseInt(EngLoadBin, 2);
      TractorInfo1.FuelAmo = parseInt(FuelAmoBin, 2);

      return TractorInfo1;
    } else if (parseString[0] == "2") {
      let parseNum = [2, 0, 0, 0, 0, 0, 0, 0, 0];
      let binString = ["2", "0", "0", "0", "0", "0", "0", "0", "0"];
      let TractorInfo2 = {
        Info: 2,
        VehicleSpd: 0,
        Shuttle: 0,
        MainGear: 0,
        TMOilTemp: 0,
        Steer: 0,
        ADBreak: 0,
        DoubleSpd: false,
        FourWD: false,
        SubGear: 0,
      };
      for (let i = 1; i <= 8; ++i) {
        parseNum[i] = parseInt(parseString[i], 10);
        binString[i] = ("00000000" + parseNum[i].toString(2)).slice(-8);
      }
      //console.log(`Result of parseInt -> ${parseString}`);
      //console.log(`Result of toString -> ${BinString}`);
      let VehicleSpdBin = binString[2].substring(0, 4) + binString[1];
      let ShuttleBin = binString[2].substring(4, 8);
      let MainGearBin = binString[3];
      let TMOilTempBin = binString[4];
      let SteerBin = binString[6].substring(0, 4) + binString[5];
      let ADBreakBin = binString[6].substring(4, 6);
      let DoubleSpdBin = binString[6].substring(7);
      let FourWDBin = binString[6].substring(8);
      let SubGearBin = binString[7];

      TractorInfo2.VehicleSpd = parseInt(VehicleSpdBin, 2) / 100; //km/h
      TractorInfo2.Shuttle = parseInt(ShuttleBin, 2);
      TractorInfo2.MainGear = parseInt(MainGearBin, 2);
      TractorInfo2.TMOilTemp = parseInt(TMOilTempBin, 2);
      TractorInfo2.Steer = parseInt(SteerBin, 2);
      TractorInfo2.ADBreak = parseInt(ADBreakBin, 2);
      TractorInfo2.SubGear = parseInt(SubGearBin, 2);
      if (DoubleSpdBin == "1") {
        TractorInfo2.DoubleSpd = true;
      } else if (DoubleSpdBin == "0") {
        TractorInfo2.DoubleSpd = false;
      }
      if (FourWDBin == "1") {
        TractorInfo2.FourWD = true;
      } else if (FourWDBin == "0") {
        TractorInfo2.FourWD = false;
      }

      return TractorInfo2;
    } else if (parseString[0] == "3") {
      //let parseNum;
      //let BinString;
      /*let TractorInfo3 = {
                "Info":3,
                "VehicleSpd":0,
                "Shuttle":0,
                "MainGear":0,
                "TMOilTemp":0,
                "Steer":0,
                "ADBreak":0,
                "DoubleSpd":false,
                "FourWD":false,
                "SubGear":0
            }
            for (let i=1; i<8; ++i) {
            parseNum[i] = (parseInt(parseString[i])); 
            BinString[i] = parseNum[i].toString(2);
            }*/

      let Dummy3 = "Tractor3 Info is OK";

      return Dummy3;
    } else if (parseString[0] == "4") {
      //For Remote control of lat lon

      //console.log('lat-lon Info arrived');
      let parseNum = [4, 0, 0, 0, 0, 0, 0, 0, 0];
      let binString = ["4", "0", "0", "0", "0", "0", "0", "0", "0"];
      let tractorInfo4 = {
        Info: 4,
        latitude: 0,
        longitude: 0,
      };
      for (let i = 1; i <= 8; ++i) {
        parseNum[i] = parseInt(parseString[i], 10);
        binString[i] = ("00000000" + parseNum[i].toString(2)).slice(-8);
      }
      let latitudeBin =
        binString[4] + binString[3] + binString[2] + binString[1];
      let longitudeBin =
        binString[8] + binString[7] + binString[6] + binString[5];

      tractorInfo4.latitude = parseInt(latitudeBin, 2) / 10000000;
      tractorInfo4.longitude = parseInt(longitudeBin, 2) / 1000000;

      // /console.log(tractorInfo4);
      return tractorInfo4;
    } else if (parseString[0] == "5") {
      //For Remote control of heading and lateralError
      //console.log('Lat & Head Error data arrived');
      let parseNum = [5, 0, 0, 0, 0, 0, 0, 0, 0];
      let binString = ["5", "0", "0", "0", "0", "0", "0", "0", "0"];
      let tractorInfo5 = {
        Info: 5,
        gpsSpeed: 0, //m/s
        headingError: 0, //deg
        lateralError: 0, //m
        steer: 0, //deg
        realSteer: 0, //deg
      };
      for (let i = 1; i <= 8; ++i) {
        parseNum[i] = parseInt(parseString[i], 10);
        binString[i] = ("00000000" + parseNum[i].toString(2)).slice(-8);
      }

      let gpsSpeedBin = binString[2] + binString[1];
      let headingErrorBin = binString[4] + binString[3];
      let lateralErrorBin = binString[6] + binString[5];

      let steerBin = binString[7];
      let realSteerBin = binString[8];

      //console.log(`headingErrorBin -> ${headingErrorBin}`);
      //console.log(`lateralErrorBin -> ${lateralErrorBin}`);
      //console.log(`steerBin -> ${steerBin}`);
      //console.log(`realsteerBin -> ${realSteerBin}`);

      tractorInfo5.gpsSpeed = parseInt(gpsSpeedBin, 2) / 100;
      tractorInfo5.headingError = parseInt(headingErrorBin, 2) / 10;
      if (
        3276.8 < tractorInfo5.headingError &&
        tractorInfo5.headingError < 6553.6
      ) {
        //console.log('head If Done');
        //console.log(`Hikizan mae headError -> ${tractorInfo5.headingError}`);
        tractorInfo5.headingError =
          Math.floor((tractorInfo5.headingError - 6553.6) * 10) / 10;
      }
      tractorInfo5.lateralError = parseInt(lateralErrorBin, 2) / 1000;
      if (
        32.768 < tractorInfo5.lateralError &&
        tractorInfo5.lateralError < 65.536
      ) {
        //console.log('lat If Done');
        //console.log(`Hikizan mae latError -> ${tractorInfo5.lateralError}`);
        tractorInfo5.lateralError =
          Math.floor((tractorInfo5.lateralError - 65.536) * 1000) / 1000;
      }
      tractorInfo5.steer = parseInt(steerBin, 2);
      if (128 < tractorInfo5.steer && tractorInfo5.steer < 256) {
        // console.log('steer If Done');
        // console.log(`Hikizan mae steer -> ${tractorInfo5.steer}`);
        tractorInfo5.steer = tractorInfo5.steer - 256;
      }
      tractorInfo5.realSteer = parseInt(realSteerBin, 2);
      if (128 < tractorInfo5.realSteer && tractorInfo5.realSteer < 256) {
        //console.log('realSteer If Done');
        //console.log(`Hikizan mae realSteer -> ${tractorInfo5.realSteer}`);
        tractorInfo5.realSteer = tractorInfo5.realSteer - 256;
      }
      console.log(tractorInfo5);
      return tractorInfo5;
    }
  } else if (typeof message != "string") {
    return 1;
  }
};

//FromIoatachannelで受け取ったオブジェクトを基にnodeからC#へTCPSocketするために文字列を作る関数
exports.maketoSharpString = (SharpDataJson) => {
  //let SharpDataJson=JSON.parse(SharpDataText);
  let controlString;

  switch (Object.keys(SharpDataJson)[0]) {
    case "engineSpeed":
      controlString = `EngineSpeed,${SharpDataJson.engineSpeed}\n`;
      break;

    case "speed":
      controlString = `Speed,${SharpDataJson.speed}\n`;
      break;

    case "hitch":
      controlString = `Hitch,${SharpDataJson.hitch}\n`;
      break;

    case "pto":
      controlString = `Pto,${SharpDataJson.pto}\n`;
      break;

    case "start":
      controlString = `Start,\n`;
      break;

    case "stop":
      controlString = `Stop,\n`;
      break;
  }
  return controlString;
};
//C#から送られてきた文字列をカンマで分割して適切な型に変換するよ
//EG83とかEG453等のヤンマー向け関数
//let SharpData="dummydayo,11122,122232,3232,323121,121,true,true";
//カンマ区切りの文字列を引数にすること
exports.parseFromSharpString = (SharpData) => {
  if (typeof SharpData == "string") {
    let parseString = SharpData.split(",");
    //console.log(parseString);

    let RecvEngineSpeed = Number(parseString[1]);
    let RecvSpeed = Number(parseString[2]);
    let RecvLatitude = Number(parseString[3]);
    let RecvLongitude = Number(parseString[4]);
    let RecvHeading = Number(parseString[5]);
    let RecvIsPtoEngaged;
    let RecvIsHitchLowerd;
    if (parseString[6] == "false") {
      RecvIsPtoEngaged = false;
    } else {
      RecvIsPtoEngaged = true;
    }

    if (parseString[7] == "false") {
      RecvIsHitchLowerd = false;
    } else {
      RecvIsHitchLowerd = true;
    }

    let VehicleInfo = {
      engineSpeed: RecvEngineSpeed,
      speed: RecvSpeed,
      latitude: RecvLatitude,
      longitude: RecvLongitude,
      heading: RecvHeading,
      isPtoEngaged: RecvIsPtoEngaged,
      isHitchLowerd: RecvIsHitchLowerd,
      vehicleName: "EG83",
    };
    //console.log(VehicleInfo);
    return VehicleInfo;
  } else {
    return 0;
  }
};

/*FromIoataイベントでrecvcan[8]を受け取る*/
/*  recvcan[8]から読みとってjsonに書き込む*/

//exports.makeJson(SharpDataJson){
/*FromIoatachannelの　FromIoata.vehicle　←オブジェクトの中のビークル種類
これによってmakeJson()とmakeCanArray()のcaseを同一にしたい
makeJsonはmakeCanArrayとスコープが異なっているのでFromIoata.vehicleを使えない
なのでデータをリレーする前のタイミングでビークル種類だけは決定しておきたい*/
//  switch (SharpDataJson.vehicle) {
//    case 'EV':
//      console.log('dddd');
//}\n
//}\n;

/*controlから送られたjsonを読む処理*/
/* 読んだ結果でreturn can[8]*/

/*let SharpDataJson={
    vehicle: 'EV',
    velocity:510,
    steer:500,
    mg1:280
}\n;*/

/*exports.makeCanArray=(SharpDataJson)=>{
let can=[0,0,0,0,0,0,0,0];
    switch (SharpDataJson.vehicle) {

        case 'EV':

            //MG1のCAN[2],[3]への振り分け
            if (SharpDataJson.mg1 > 255) {
                can[3] = SharpDataJson.mg1-255;
                can[2] = 255;
            }\n
            else {
                can[2]=SharpDataJson.mg1;
            }\n

            //Velocity(MG2)のCAN[4],[5]への振り分け
            if (SharpDataJson.velocity > 255) {
                can[5] = SharpDataJson.velocity-255;
                can[4] = 255;
            }\n
            else {
                can[4]=SharpDataJson.velocity;
            }\n

            //steerのCAN[6],[7]への振り分け
            if (SharpDataJson.steer > 255) {
                can[7] = SharpDataJson.steer-255;
                can[6] = 255;
            }\n
            else {
                can[6]=SharpDataJson.steer;
            }\n

            return can;

        case 'KUBOTA':
            break;

        default:
            console.log('No signal from controller');
            break;
    }\n
}\n*/
