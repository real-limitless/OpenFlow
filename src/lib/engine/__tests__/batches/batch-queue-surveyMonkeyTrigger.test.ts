import { assertExecutorRegistered, runNode } from "../helpers";

const TYPE = "n8n-nodes-base.surveyMonkeyTrigger";

beforeAll(() => {
  assertExecutorRegistered(TYPE);
});

describe("SurveyMonkey Trigger", () => {
  it("should emit webhook envelope for survey_created event", async () => {
    const payload = {
      event_type: "survey_created",
      event_id: "evt_001",
      resource_id: "12345",
      resources: { survey_id: "12345" },
    };
    const [out] = await runNode(TYPE, {
      authentication: "accessToken",
      objectType: "survey",
      event: "survey_created",
    }, [payload]);
    expect(out).toHaveLength(1);
    expect(out[0].json.event_type).toBe("survey_created");
    expect(out[0].json.resource_id).toBe("12345");
  });

  it("should filter to only answers when resolveData and onlyAnswers are true", async () => {
    const payload = {
      event_type: "response_completed",
      resources: { survey_id: "survey_123", response_id: "resp_456" },
      answers: { q1: "Yes", q2: "No" },
    };
    const [out] = await runNode(TYPE, {
      authentication: "accessToken",
      objectType: "survey",
      event: "response_completed",
      surveyIds: ["survey_123"],
      resolveData: true,
      onlyAnswers: true,
    }, [payload]);
    expect(out).toHaveLength(1);
    expect(out[0].json.answers).toEqual({ q1: "Yes", q2: "No" });
  });

  it("should emit webhook envelope for collector_updated event filtered to specific collector", async () => {
    const payload = {
      event_type: "collector_updated",
      resources: { collector_id: "collector_789" },
    };
    const [out] = await runNode(TYPE, {
      authentication: "accessToken",
      objectType: "collector",
      event: "collector_updated",
      surveyId: "survey_123",
      collectorIds: ["collector_789"],
    }, [payload]);
    expect(out).toHaveLength(1);
    expect(out[0].json.event_type).toBe("collector_updated");
  });

  it("should ignore unregistered event types", async () => {
    const payload = {
      event_type: "collector_created",
    };
    const [out] = await runNode(TYPE, {
      objectType: "survey",
      event: "response_completed",
    }, [payload]);
    expect(out).toHaveLength(0);
  });

  it("should emit empty item when no input", async () => {
    const [out] = await runNode(TYPE, { objectType: "survey" }, [{}]);
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual({});
  });
});
