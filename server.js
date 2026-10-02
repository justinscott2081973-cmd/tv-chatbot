const http = require("http");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.5-flash-lite";

const BUSINESS_NAME =
  process.env.BUSINESS_NAME || "InternetTVSolutionsUSA";

const SYSTEM_PROMPT = `
You are the website assistant for ${BUSINESS_NAME}.

You help customers with questions about DIRECTV and home internet services.

Be friendly, helpful, and concise.

Rules:
- Keep replies under 80 words.
- Ask only one question at a time.
- Do not invent prices, promotions, channel lineups, speeds, or availability.
- If a customer asks about current pricing or availability, explain that a sales agent can confirm the current options for their address.
- Never claim to be a human.
- Do not ask customers to create an account.
- Do not collect or store customer information.
`;

const PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>${BUSINESS_NAME} Chat</title>

<style>
:root {
  --bg: #f6f7f9;
  --card: #ffffff;
  --text: #1b1f24;
  --muted: #6b7280;
  --brand: #0b5ed7;
  --bot: #e9ecf1;
  --border: #dde1e7;
}

* {
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  margin: 0;
}

body {
  background: var(--bg);
  color: var(--text);
  font: 16px/1.5 system-ui, sans-serif;
}

#app {
  height: 100%;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  background: var(--card);
}

header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 18px;
}

#log {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.m {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 16px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.u {
  align-self: flex-end;
  background: var(--brand);
  color: white;
  border-bottom-right-radius: 4px;
}

.b {
  align-self: flex-start;
  background: var(--bot);
  border-bottom-left-radius: 4px;
}

#bar {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border);
}

#in {
  flex: 1;
  padding: 11px 14px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  outline: none;
}

#send {
  background: var(--brand);
  color: white;
  border: 0;
  border-radius: 12px;
  padding: 0 20px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

#send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
</head>

<body>

<div id="app">

<header>${BUSINESS_NAME}</header>

<div id="log"></div>

<div id="bar">
  <input
    id="in"
    placeholder="Ask about DIRECTV or internet plans..."
    autocomplete="off"
  />

  <button id="send">Send</button>
</div>

</div>

<script>

const log = document.getElementById("log");
const input = document.getElementById("in");
const send = document.getElementById("send");

let messages = [];
let busy = false;

function addMessage(type, text) {
  const div = document.createElement("div");

  div.className = "m " + type;
  div.textContent = text;

  log.appendChild(div);
  log.scrollTop = log.scrollHeight;

  return div;
}

addMessage(
  "b",
  "Hi! I can answer questions about DIRECTV and home internet. What are you looking for?"
);

async function sendMessage() {

  const text = input.value.trim();

  if (!text || busy) {
    return;
  }

  busy = true;
  send.disabled = true;

  input.value = "";

  addMessage("u", text);

  messages.push({
    role: "user",
    content: text
  });

  const botMessage = addMessage("b", "...");

  try {

    const response = await fetch("/api/chat", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        messages: messages
      })

    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    botMessage.textContent = data.reply;

    messages.push({
      role: "assistant",
      content: data.reply
    });

  } catch (error) {

    console.error(error);

    botMessage.textContent =
      "Sorry, something went wrong. Please try again.";

    messages.pop();
  }

  busy = false;
  send.disabled = false;
  input.focus();
}

send.addEventListener("click", sendMessage);

input.addEventListener("keydown", function(event) {

  if (event.key === "Enter") {
    sendMessage();
  }

});

</script>

</body>
</html>
`;

function sendResponse(res, status, type, data) {

  res.writeHead(status, {
    "Content-Type": type
  });

  res.end(data);
}

function readBody(req) {

  return new Promise((resolve, reject) => {

    let body = "";

    req.on("data", chunk => {

      body += chunk;

      if (body.length > 50000) {
        reject(new Error("Request too large"));
        req.destroy();
      }

    });

    req.on("end", () => {
      resolve(body);
    });

    req.on("error", reject);

  });

}

async function handleChat(req, res) {

  if (!GEMINI_API_KEY) {

    return sendResponse(
      res,
      500,
      "application/json",
      JSON.stringify({
        error: "GEMINI_API_KEY is missing"
      })
    );

  }

  try {

    const body = JSON.parse(await readBody(req));

    const messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    if (!messages.length) {

      return sendResponse(
        res,
        400,
        "application/json",
        JSON.stringify({
          error: "No messages provided"
        })
      );

    }

    const contents = messages
      .slice(-20)
      .map(message => ({

        role:
          message.role === "assistant"
            ? "model"
            : "user",

        parts: [
          {
            text: String(message.content || "").slice(0, 2000)
          }
        ]

      }));

    const geminiResponse = await fetch(

      "https://generativelanguage.googleapis.com/v1beta/models/" +
      GEMINI_MODEL +
      ":generateContent",

      {

        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },

        body: JSON.stringify({

          systemInstruction: {
            parts: [
              {
                text: SYSTEM_PROMPT
              }
            ]
          },

          contents: contents,

          generationConfig: {
            maxOutputTokens: 400
          }

        })

      }

    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {

      console.error("Gemini API error:", data);

      return sendResponse(
        res,
        502,
        "application/json",
        JSON.stringify({
          error:
            data?.error?.message ||
            "Gemini API error"
        })
      );

    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") ||
      "Sorry, I could not generate a response.";

    return sendResponse(
      res,
      200,
      "application/json",
      JSON.stringify({
        reply: reply
      })
    );

  } catch (error) {

    console.error("Chat error:", error);

    return sendResponse(
      res,
      500,
      "application/json",
      JSON.stringify({
        error: "Server error"
      })
    );

  }

}

const server = http.createServer(async (req, res) => {

  const url = new URL(
    req.url,
    "http://localhost"
  );

  try {

    if (
      req.method === "GET" &&
      url.pathname === "/"
    ) {

      return sendResponse(
        res,
        200,
        "text/html; charset=utf-8",
        PAGE
      );

    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/chat"
    ) {

      return await handleChat(req, res);

    }

    return sendResponse(
      res,
      404,
      "text/plain",
      "Not found"
    );

  } catch (error) {

    console.error(error);

    return sendResponse(
      res,
      500,
      "text/plain",
      "Server error"
    );

  }

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

  console.log(
    "Chatbot running on port " + PORT
  );

});
