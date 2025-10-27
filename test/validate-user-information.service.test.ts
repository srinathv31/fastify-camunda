import { validateUserInformationService } from "../src/camunda/processes/onboard-user/topics/validate-user-information/service";
import { BusinessRuleError } from "../src/lib/errors";

describe("validateUserInformationService", () => {
  const ctx = {
    app: {
      db: {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      },
    },
  } as any;

  it("returns validated=true and normalized user id when input is valid", async () => {
    const input = { userId: "Alice " };
    const out = await validateUserInformationService(input, ctx);
    expect(out.validated).toBe(true);
    expect(out.normalizedUserId).toBe("alice");
  });

  it('throws BusinessRuleError when userId contains "invalid"', async () => {
    const input = { userId: "invalid_user" };
    await expect(
      validateUserInformationService(input, ctx)
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});
