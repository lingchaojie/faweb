const { createApp } = require("./src/create-app");

const PORT = process.env.PORT ?? 8001;
const app = createApp();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Doc processing worker listening on :${PORT}`);
});
