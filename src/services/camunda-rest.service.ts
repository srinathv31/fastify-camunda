import { request } from "undici";

/**
 * Service for interacting with the Camunda REST API. This includes methods
 * for starting process instances and other process-related operations.
 */

export interface CamundaVariable {
  value: any;
  type: string;
}

export interface StartProcessInstanceParams {
  key: string;
  businessKey?: string;
  variables?: Record<string, CamundaVariable>;
}

export interface StartProcessInstanceResponse {
  id: string;
  definitionId: string;
  businessKey?: string;
  caseInstanceId?: string;
  ended: boolean;
  suspended: boolean;
  tenantId?: string;
}

/**
 * Start a process instance in Camunda via the REST API.
 *
 * @param baseUrl Camunda base URL (e.g., http://localhost:8080/engine-rest)
 * @param params Process start parameters
 * @returns Process instance details
 */
export async function startProcessInstance(
  baseUrl: string,
  params: StartProcessInstanceParams
): Promise<StartProcessInstanceResponse> {
  const url = `${baseUrl}/process-definition/key/${params.key}/start`;

  const body = {
    businessKey: params.businessKey,
    variables: params.variables ?? {},
  };

  try {
    const response = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.statusCode !== 200) {
      const errorText = await response.body.text();
      throw new Error(
        `Camunda API error: ${response.statusCode} - ${errorText}`
      );
    }

    const result = await response.body.json();
    return result as StartProcessInstanceResponse;
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Failed to start Camunda process: ${err.message}`);
    }
    throw new Error("Failed to start Camunda process");
  }
}
