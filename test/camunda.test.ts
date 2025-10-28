import { Variables } from "camunda-external-task-client-js";
import {
  readVars,
  completeWith,
  handleBpmnErrorWith,
  toBpmnError,
} from "../src/lib/camunda";
import { BusinessRuleError } from "../src/lib/errors";

describe("camunda utilities", () => {
  describe("readVars", () => {
    it("converts Camunda task variables to plain object", () => {
      const mockTask = {
        variables: {
          getAll: jest
            .fn()
            .mockReturnValue({ userId: "user1", validated: true }),
        },
      } as any;

      const result = readVars(mockTask);

      expect(result).toEqual({ userId: "user1", validated: true });
      expect(mockTask.variables.getAll).toHaveBeenCalled();
    });

    it("returns a shallow copy to prevent mutation", () => {
      const originalVars = { userId: "user1", validated: true };
      const mockTask = {
        variables: {
          getAll: jest.fn().mockReturnValue(originalVars),
        },
      } as any;

      const result = readVars(mockTask);
      result.userId = "modified";

      // Original should not be modified
      expect(originalVars.userId).toBe("user1");
    });
  });

  describe("completeWith", () => {
    it("completes task with output variables", async () => {
      const mockTaskService = {
        complete: jest.fn().mockResolvedValue(undefined),
      } as any;

      const mockTask = {} as any;

      await completeWith(mockTaskService, mockTask, {
        result: "success",
        value: 42,
      });

      expect(mockTaskService.complete).toHaveBeenCalledTimes(1);
      expect(mockTaskService.complete).toHaveBeenCalledWith(
        mockTask,
        expect.any(Variables)
      );
    });
  });

  describe("handleBpmnErrorWith", () => {
    it("handles BPMN error with variables", async () => {
      const mockTaskService = {
        handleBpmnError: jest.fn().mockResolvedValue(undefined),
      } as any;

      const mockTask = {} as any;

      await handleBpmnErrorWith(
        mockTaskService,
        mockTask,
        "ERROR_CODE",
        "Error message",
        { errorType: "VALIDATION_ERROR", details: "test" }
      );

      expect(mockTaskService.handleBpmnError).toHaveBeenCalledTimes(1);
      expect(mockTaskService.handleBpmnError).toHaveBeenCalledWith(
        mockTask,
        "ERROR_CODE",
        "Error message",
        expect.any(Variables)
      );
    });

    it("handles BPMN error without variables", async () => {
      const mockTaskService = {
        handleBpmnError: jest.fn().mockResolvedValue(undefined),
      } as any;

      const mockTask = {} as any;

      await handleBpmnErrorWith(
        mockTaskService,
        mockTask,
        "ERROR_CODE",
        "Error message"
      );

      expect(mockTaskService.handleBpmnError).toHaveBeenCalledTimes(1);
      expect(mockTaskService.handleBpmnError).toHaveBeenCalledWith(
        mockTask,
        "ERROR_CODE",
        "Error message"
      );
    });
  });

  describe("toBpmnError", () => {
    it("converts BusinessRuleError to BPMN error", () => {
      const error = new BusinessRuleError(
        "VALIDATION_FAILED",
        "Invalid input",
        {
          field: "userId",
        }
      );

      const result = toBpmnError(error);

      expect(result).toEqual({
        code: "EMPLOYEE_CARD_ERROR",
        message: "Invalid input",
        details: {
          errorType: "VALIDATION_FAILED",
          field: "userId",
        },
      });
    });

    it("converts ZodError to BPMN error", () => {
      const zodError = {
        name: "ZodError",
        errors: [{ path: ["userId"], message: "Required" }],
      };

      const result = toBpmnError(zodError);

      expect(result).toEqual({
        code: "EMPLOYEE_CARD_ERROR",
        message: "Input validation failed",
        details: {
          errorType: "VALIDATION_ERROR",
          zodError: [{ path: ["userId"], message: "Required" }],
        },
      });
    });

    it("converts generic Error to BPMN error", () => {
      const error = new Error("Something went wrong");

      const result = toBpmnError(error);

      expect(result).toEqual({
        code: "EMPLOYEE_CARD_ERROR",
        message: "Something went wrong",
        details: {
          errorType: "TECHNICAL_ERROR",
        },
      });
    });

    it("converts non-Error objects to BPMN error", () => {
      const result = toBpmnError("string error");

      expect(result).toEqual({
        code: "EMPLOYEE_CARD_ERROR",
        message: "string error",
        details: {
          errorType: "TECHNICAL_ERROR",
        },
      });
    });

    it("converts null/undefined to BPMN error", () => {
      const result = toBpmnError(null);

      expect(result).toEqual({
        code: "EMPLOYEE_CARD_ERROR",
        message: "null",
        details: {
          errorType: "TECHNICAL_ERROR",
        },
      });
    });
  });
});
