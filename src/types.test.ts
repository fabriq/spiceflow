import { expect } from "@std/expect";
import { createSpiceflowClient } from "./client/mod.ts";
import { Spiceflow } from "./spiceflow.ts";
import type { Prettify } from "./types.ts";

Deno.test("`use` on non Spiceflow return", async () => {
  function nonSpiceflowReturn() {
    return new Spiceflow() as any;
  }
  const app = new Spiceflow().use(nonSpiceflowReturn()).post(
    "/xxx",
    () => "hi",
  );
  const res = await app.handle(
    new Request("http://localhost/xxx", { method: "POST" }),
  );

  const client = createSpiceflowClient(app);

  type ClientType = Prettify<typeof client>;
  // @ts-expect-error
  client.something;

  client.xxx.post();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual("hi");
});

Deno.test("`handle` accepts state as second argument in object", async () => {
  const app = new Spiceflow().state("counter", 0).post("/state-test", (c) => {
    return { counter: c.state.counter };
  });

  const res = await app.handle(
    new Request("http://localhost/state-test", { method: "POST" }),
    { state: { counter: 42 } },
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ counter: 42 });

  await app.handle(
    new Request("http://localhost/state-test", { method: "POST" }),
    // @ts-expect-error - Invalid state key
    { state: { invalidKey: 100 } },
  );
});

Deno.test("`use` on Spiceflow return", async () => {
  function nonSpiceflowReturn() {
    return new Spiceflow().post("/usePost", () => "hi");
  }
  const app = new Spiceflow().use(nonSpiceflowReturn()).post(
    "/xxx",
    () => "hi",
  );
  const res = await app.handle(
    new Request("http://localhost/xxx", { method: "POST" }),
  );

  const client = createSpiceflowClient(app);
  client.xxx.post();
  client.usePost.post();

  type ClientType = Prettify<typeof client>;
  // @ts-expect-error
  client.something;

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual("hi");
});

Deno.test("async generator type with client", async () => {
  const app = new Spiceflow().get("/stream", async function* () {
    yield { message: "Hello" };
    yield { message: "World" };
  });

  const client = createSpiceflowClient(app);

  const streamResponse = await client.stream.get();
  if (streamResponse.error) {
    throw streamResponse.error;
  }

  // Type check: each yielded item should have the 'message' property
  for await (const item of streamResponse.data) {
    // @ts-expect-error Expecting error when picking a property that doesn't exist
    item.something;

    item.message;

    expect(item).toHaveProperty("message");
    expect(typeof item.message).toBe("string");
  }
});
