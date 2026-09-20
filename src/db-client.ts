import type {
  FileDetails,
  HealthInfo,
  InspectColumn,
  InspectRows,
  InspectTable,
  SearchHit,
  TreeNode,
  WorkerRequest,
  WorkerResponse,
} from "./types.js"

let requestId = 0;
let worker: Worker;

function call<T>(request: WorkerRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== request.id) {
        return;
      }
      worker.removeEventListener("message", onMessage);
      if (event.data.ok) {
        resolve(event.data.data as T);
      } else {
        reject(new Error(event.data.error));
      }
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage(request);
  });
}

function nextRequest<T extends WorkerRequest["type"]>(
  type: T,
  payload: Omit<Extract<WorkerRequest, { type: T }>, "id" | "type">,
): Extract<WorkerRequest, { type: T }> {
  return { id: ++requestId, type, ...payload } as Extract<WorkerRequest, { type: T }>;
}

export function initDbClient(workerInstance: Worker) {
  worker = workerInstance;
}

export function loadDatabase(bytes: ArrayBuffer, fileName: string) {
  return call<HealthInfo>(nextRequest("load", { bytes, fileName }));
}

export function fetchTree(parent: string | null) {
  return call<TreeNode[]>(nextRequest("tree", { parent }));
}

export function fetchNode(path: string) {
  return call<FileDetails>(nextRequest("node", { path }));
}

export function searchDatabase(query: string) {
  return call<SearchHit[]>(nextRequest("search", { query }));
}

export function fetchHealth() {
  return call<HealthInfo>(nextRequest("health", {}));
}

export function fetchInspectTables() {
  return call<InspectTable[]>(nextRequest("inspectTables", {}));
}

export function fetchInspectSchema(table: string) {
  return call<InspectColumn[]>(nextRequest("inspectSchema", { table }));
}

export function fetchInspectRows(table: string, offset = 0, limit = 100) {
  return call<InspectRows>(nextRequest("inspectRows", { table, offset, limit }));
}
