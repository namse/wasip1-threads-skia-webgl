const express = require("express");
const path = require("path");

const app = express();

app.use((req, res, next) => {
  console.log(req.method, req.url);
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
});

app.use(express.static(path.join(__dirname, "../on-browser/dist")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../on-browser/dist/index.html"));
});
app.get("/namui-runtime-wasm.wasm", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      // "../namui-runtime-wasm/target/wasm32-wasip1-threads/debug/namui-runtime-wasm.wasm"
      "../namui-runtime-wasm.wasm"
    )
  );
});
app.get("/namui-runtime-wasm.wasm.sourcemap", (req, res) => {
  res.sendFile(path.join(__dirname, "../namui-runtime-wasm.wasm.sourcemap"));
});

app.listen(3000, () => {
  console.log("Server started on http://localhost:3000");
});
