import type { IncomingMessage, ServerResponse } from 'node:http';

declare module 'express' {
  export interface Request extends IncomingMessage {
    query: Record<string, any>;
    params: Record<string, string>;
    body: any;
    headers: Record<string, string | string[] | undefined>;
    [key: string]: any;
  }

  export interface Response extends ServerResponse {
    status(code: number): this;
    json(body: any): this;
    send(body: any): this;
    sendStatus(code: number): this;
    writeHead(statusCode: number, headers?: Record<string, any>): this;
    write(chunk: any, encoding?: any, callback?: any): boolean;
    end(chunk?: any, encoding?: any, callback?: any): this;
    setHeader(name: string, value: number | string | readonly string[]): this;
    flushHeaders?(): void;
    [key: string]: any;
  }

  export type NextFunction = (err?: any) => void;
  export type RequestHandler = (req: Request, res: Response, next?: NextFunction) => any;

  export interface IRouterMatcher<T> {
    (path: string | RegExp, ...handlers: RequestHandler[]): T;
  }

  export interface Router {
    get: IRouterMatcher<this>;
    post: IRouterMatcher<this>;
    put: IRouterMatcher<this>;
    delete: IRouterMatcher<this>;
    patch: IRouterMatcher<this>;
    use: IRouterMatcher<this>;
    (req: Request, res: Response, next?: NextFunction): void;
  }

  function express(): any;
  namespace express {
    export function Router(options?: any): Router;
  }
  export default express;
}
