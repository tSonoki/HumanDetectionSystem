const WebSocket = require("ws");
const server = new WebSocket.Server({ port: 8081 });
let clientBool = false;
let remoteControlSocket = null;
let virtualTractorSocket = null;

const net = require("net");
const {
  parseMR1000AMessage,
  makeMessageMR1000A,
} = require("./node-function.js");
const { latLonToUTM54 } = require("./positioningLib.js");
let vehicleSelecter;
const clients = new Set();

const inputAutorunInfo = {
  inputSteer: 0,
  inputEngineCycle: 0,
  inputGear: 1,
  inputShuttle: 0,
  inputSpeed: 0,
  inputPtoHeight: 0,
  inputPtoOn: 0,
  inputHorn: 0,
  isRemoteCont: 0,
  isAutoRunStart: 0,
  isUseSafetySensorInTeleDrive: 0,
};

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

const virtualInputInfo = {
  outputEasting: 0,
  outputNorthing: 0,
  outputHeading: 0,
  outputVelocity: 0,
  inputVelocity: 0,
  inputSteering: 0,
  inputShuttle: 0,
  inputRemoteCont: 0,
  start: false,
};

console.log("Server is running on ws://localhost:8081");

/*setInterval(() => {
  console.log(`Type of inputAutorunInfo: ${typeof inputAutorunInfo}`);
  console.log("Current inputAutorunInfo:", inputAutorunInfo);
  Object.entries(inputAutorunInfo).forEach(([key, value]) => {
    console.log(`${key}: ${typeof value}`);
  });
}, 1000);*/

server.on("connection", (webSocket) => {
  webSocket.on("message", (wsMessage) => {
    // console.log("Received message:", message);
    try {
      // WebSocketからのメッセージを文字列として解析
      const wsData = JSON.parse(wsMessage);
      //console.log("Parsed data:", data);

      // typeプロパティに基づいてソケットを分類
      if (wsData.type === "remote-control") {
        remoteControlSocket = webSocket;
        console.log("Remote control connected");
      } else if (wsData.type === "virtual-tractor") {
        virtualTractorSocket = webSocket;
        console.log("Virtual tractor connected");
      } else if (wsData.type === "inputAutorunInfo") {
        inputAutorunInfo.inputSteer = wsData.payload.inputInfo.inputSteer;
        inputAutorunInfo.inputEngineCycle =
          wsData.payload.inputInfo.inputEngineCycle;
        inputAutorunInfo.inputGear = wsData.payload.inputInfo.inputGear;
        inputAutorunInfo.inputShuttle = wsData.payload.inputInfo.inputShuttle;
        inputAutorunInfo.inputSpeed = wsData.payload.inputInfo.inputSpeed;
        inputAutorunInfo.inputPtoHeight =
          wsData.payload.inputInfo.inputPtoHeight;
        inputAutorunInfo.inputPtoOn = wsData.payload.inputInfo.inputPtoOn;
        inputAutorunInfo.inputHorn = wsData.payload.inputInfo.inputHorn;
        inputAutorunInfo.isRemoteCont = wsData.payload.inputInfo.isRemoteCont;
        inputAutorunInfo.isUseSafetySensorInTeleDrive =
          wsData.payload.inputInfo.isUseSafetySensorInTeleDrive;
      } else if (wsData.type === "to-virtual-data") {
        virtualInputInfo.steering = inputAutorunInfo.inputSteer;
        virtualInputInfo.velocity = inputAutorunInfo.inputSpeed;
        //console.log("Updated Virtual Info:", virtualInputInfo);
        //console.log("data no type =>" + typeof data);
        //console.log("received data keys:", Object.keys(data));

        if (typeof wsData === "object" && wsData !== null) {
          Object.keys(inputAutorunInfo).forEach((key) => {
            if (wsData.hasOwnProperty(key)) {
              inputAutorunInfo[key] = wsData[key];
            }
          });
        }

        //console.log("Updated inputAutorunInfo:", inputAutorunInfo);
        //console.log(`Received message`);
        //console.log(data);
      } else {
        // typeが指定されていない場合の処理
        //console.log("Received message without type:", wsData);
      }
    } catch (err) {
      console.error("Error parsing message:", err);
    }
  });

  webSocket.on("close", () => {
    // ソケットがクローズされたときの処理
    if (webSocket === remoteControlSocket) {
      console.log("Remote control disconnected");
      remoteControlSocket = null;
    } else if (webSocket === virtualTractorSocket) {
      console.log("Virtual tractor disconnected");
      virtualTractorSocket = null;
    }
    console.log("Connection has closed");
  });

  setInterval(() => {
    if (remoteControlSocket != null) {
      const autorunOutputData = {
        type: "autorun-output-data",
        payload: { outputAutorunInfo: mr1000aReceiveInfo },
      };
      remoteControlSocket.send(JSON.stringify(autorunOutputData));
      console.log("Sent message to remote control:", autorunOutputData);
    }
  }, 33);
});

net
  .createServer((tcpSocket) => {
    // TCPクライアントが接続されたときに実行される
    console.log(
      `TCP client connected: ${tcpSocket.remoteAddress}:${tcpSocket.remotePort}`
    );

    tcpSocket.on("data", (tcpData) => {
      try {
        const message = tcpData.toString("utf-8");
        //console.log("Received message from TCP client:", message);
        mr1000aReceiveInfo = parseMR1000AMessage(message);
        console.log("Parsed MR1000A data:", mr1000aReceiveInfo);
      } catch (err) {
        console.error("Error parsing TCP client data:", err);
      }
    });

    tcpSocket.on("close", () => {
      console.log("TCP connection has closed");
    });

    // その他の処理があればここに記述
    setInterval(() => {
      const tcpSocketMessage = makeMessageMR1000A(inputAutorunInfo);
      tcpSocket.write(tcpSocketMessage);
    }, 100);
  })
  .listen(4000, () => {
    console.log("TCP Server is running on port 4000");
  });
