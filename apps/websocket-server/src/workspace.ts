import http from "http";
import { WebSocketServer } from "ws";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

const server = http.createServer();
const wss = new WebSocketServer({ server });

const WORKSPACES_DIR = path.join(__dirname, "workspaces");

// Track containers per user per language
const containers: Record<string, Record<string, string>> = {};

wss.on('connection', (ws, req) => {
    const queryParams = new URLSearchParams(req.url?.split("?")[1]);
    const userId = queryParams.get("id");

    if (!userId) {
        ws.send(JSON.stringify({ type: "error", message: "No userId provided" }));
        ws.close();
        return;
    }

    const userDir = path.join(WORKSPACES_DIR, userId);

    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

    ws.on('message', async (message) => {
        const data = JSON.parse(message.toString());

        if (data.type === "code:change") {
            const codePath = path.join(userDir, data.filepath);
            try {
                await fs.promises.writeFile(codePath, data.code, "utf8");
                ws.send(JSON.stringify({ type: "saved", path: codePath }));
            } catch (err: any) {
                ws.send(JSON.stringify({ type: "error", error: err.message }));
            }
        }



        if (data.type === "exec:run") {
            const { language, entryFile, input } = data;

            // Initialize containers[userId] object if not exists
            if (!containers[userId]) containers[userId] = {};
            let containerName = containers[userId][language];

            const fileWorkspacePath = path.join(userDir, entryFile);

            const run = () => {
                // Write input.txt
                const inputFile = path.join(userDir, "input.txt");
                fs.writeFileSync(inputFile, input || "", "utf8");

                // Command to run code inside the container
                let cmd = "";
                switch (language) {
                    case "python":
                        cmd = `docker exec ${containerName} python ${entryFile} < input.txt`;
                        break;
                    case "javascript":
                        cmd = `docker exec ${containerName} node ${entryFile} < input.txt`;
                        break;
                    case "cpp":
                        cmd = `docker exec ${containerName} bash -c "g++ ${entryFile} -o a.out && ./a.out < input.txt"`;
                        break;
                    case "java":
                        cmd = `docker exec ${containerName} bash -c "javac ${entryFile} && java ${entryFile.replace('.java','')} < input.txt"`;
                        break;
                    case "go":
                        cmd = `docker exec ${containerName} go run ${entryFile} < input.txt`;
                        break;
                    default:
                        ws.send(JSON.stringify({ type: "error", message: "Unsupported language" }));
                        return;
                }

                exec(cmd, (err, stdout, stderr) => {
                    if (err) {
                        ws.send(JSON.stringify({ type: "output", output: `Error: ${err.message}` }));
                        return;
                    }
                    ws.send(JSON.stringify({ type: "output", output: stdout || stderr }));
                });
            };

            if (!containerName) {
                // Start a new container for this user & language
                containerName = `workspace_${userId}_${language}`;
                containers[userId][language] = containerName;

                exec(
                    `docker run -dit --name ${containerName} -v ${userDir}:/workspace -w /workspace ${getDockerImage(language)} bash`,
                    (err) => {
                        if (err) {
                            ws.send(JSON.stringify({
                                type: "error",
                                message: `Failed to start container: ${err.message}`
                            }));
                            return;
                        }
                        run(); // Run the code after container starts
                    }
                );
            } else {
                // Container exists, just run code
                run();
            }
        }

    });
});

function getDockerImage(language: string) {
    switch (language) {
        case "python": return "python:3.9";
        case "javascript": return "node:18";
        case "cpp": return "gcc:11";
        case "java": return "openjdk:17";
        case "go": return "golang:1.18";
        default: return "python:3.9";
    }
}

server.listen(5000, '0.0.0.0', () => {
    console.log("WebSocket server started on port 5000");
});
