import express from "express";
import router from "./routes.ts";
import env from "./schemas/env.ts";

const app = express();

app.use("/api", router);

app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
});
