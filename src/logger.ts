import consola from "consola";
import config from "./config.ts";

// Configure consola logger
const logger = consola.create({
  level: config.LOG_LEVEL || 4, // 4 = info level, 5 = debug level
});

export default logger;