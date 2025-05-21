import { assertSnapshot } from "@std/testing/snapshot";
import { Spiceflow } from "./spiceflow.ts";
import { openapi } from "./openapi.ts";
import { z } from "zod";

Deno.test("openapi response", async (t) => {
  const app = new Spiceflow()
    .use(
      openapi({
        info: {
          title: "Spiceflow Docs",
          version: "0.0.0",
        },
      }),
    )
    .use(
      new Spiceflow({ basePath: "/one" }).get(
        "/ids/:id",
        ({ params }) => {
          if (Math.random() < 0.5) {
            // TODO add a way to set status

            return {
              message: "sdf",
            };
          }
          return params.id;
        },
        {
          response: {
            200: z.string(),
            404: z.object({
              message: z.string(),
            }),
          },
        },
      ),
    )
    .patch(
      "/addBody",
      async (c) => {
        const body = await c.request.json();
        return body;
      },
      {
        body: z.object({
          name: z.string(),
        }),
        response: z.object({
          name: z.string().optional(),
        }),
      },
    )
    .get(
      "/queryParams",
      async (c) => {
        const query = c.query;
        return query;
      },
      {
        query: z.object({
          name: z.string(),
        }),
        response: z.object({
          name: z.string().optional(),
        }),
      },
    )
    .post(
      "/queryParams",
      async (c) => {
        const query = c.query;
        return query;
      },
      {
        detail: {
          description: "This is a post",
          operationId: "postQueryParamsXXX",
        },
        body: z.object({
          name: z.string(),
        }),
        response: z.object({
          name: z.string().optional(),
        }),
      },
    )
    .get(
      "/stream",
      async function* () {
        for (let i = 0; i < 3; i++) {
          yield { count: i };
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      },
      {
        detail: {
          description: "This is a stream",
        },
        // response: z.object({
        //   count: z.number(),
        // }),
      },
    )
    .get(
      "/streamWithSchema",
      async function* () {
        for (let i = 0; i < 3; i++) {
          yield { count: i };
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      },
      {
        detail: {
          description: "This is a stream with schema",
        },
        response: z.object({
          count: z.number(),
        }),
      },
    )
    .post(
      "/formWithSchemaForm",
      () => {
        const formData = new FormData();
        formData.append("name", "test");
        formData.append("age", "25");
        return new Response(formData, {
          headers: {
            "content-type": "multipart/form-data",
          },
        });
      },
      {
        detail: {
          description: "This returns form data with schema",
        },
        response: z.object({
          name: z.string(),
          age: z.string(),
        }),
        type: "multipart/form-data",
      },
    )
    .use(
      new Spiceflow({ basePath: "/two" }).get(
        "/ids/:id",
        ({ params }) => params.id,
        {
          params: z.object({
            id: z.string(),
          }),
        },
      ),
    );
  const openapiSchema = await app
    .handle(new Request("http://localhost/openapi"))
    .then((x) => x.json());

  await assertSnapshot(t, openapiSchema);
});
