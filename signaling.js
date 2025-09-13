const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 8080 });
const clients = { offer: null, answer: null }; // OfferとAnswerクライアントを管理

server.on('connection', (socket) => {
    let clientId = null;

    socket.on('message', (message) => {
        const data = JSON.parse(message);
        const { type, payload } = data;

        switch (type) {
            case 'register-offer':
                // Offerクライアントを登録
                clientId = 'offer';
                clients.offer = socket;
                console.log('Offer client registered.');
                break;

            case 'register-answer':
                // Answerクライアントを登録
                clientId = 'answer';
                clients.answer = socket;
                console.log('Answer client registered.');
                break;

            case 'offer':
            case 'answer':
            case 'ice-offer':
            case 'ice-answer':
                // SDP/ICEの中継処理
                const targetId = type.includes('offer') ? 'answer' : 'offer';
                const targetSocket = clients[targetId];

                if (targetSocket) {
                    targetSocket.send(JSON.stringify({ type, payload }));
                    console.log(`Message relayed from ${clientId} to ${targetId}: ${type}`);
                } else {
                    console.warn(`Target client not connected: ${targetId}`);
                }
                break;

            default:
                console.warn(`Unknown message type: ${type}`);
                break;
        }
    });

    socket.on('close', () => {
        if (clientId) {
            clients[clientId] = null;
            console.log(`${clientId.charAt(0).toUpperCase() + clientId.slice(1)} client disconnected.`);
        }
    });
});

console.log('WebSocket server running on ws://localhost:8080');
