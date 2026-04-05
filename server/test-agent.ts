import supertest from "supertest";
import { createTestAgent } from "./test-request.js";

type AppHandler = Parameters<typeof createTestAgent>[0];

export function makeRequestAgent(app: AppHandler) {
  if (process.env.SF_PULSE_TEST_TRANSPORT === "in-process") {
    return createTestAgent(app);
  }

  return supertest(app);
}

export type RequestAgent = ReturnType<typeof makeRequestAgent>;
