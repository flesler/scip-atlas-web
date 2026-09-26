/// <reference types="vite/client" />

declare module "*?worker&inline" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

declare module "*.svg?raw" {
  const content: string
  export default content
}
