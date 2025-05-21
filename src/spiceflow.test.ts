import { expect } from "@std/expect";
import { bfs, cloneDeep, Spiceflow } from "./spiceflow.ts";
import { z } from "zod";
import { createSpiceflowClient } from "./client/mod.ts";
import { assertSnapshot } from "@std/testing/snapshot";

Deno.test("works", async () => {
  const res = await new Spiceflow()
    .post("/xxx", () => "hi")
    .handle(new Request("http://localhost/xxx", { method: "POST" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual("hi");
});

Deno.test("cloneDeep", async (t) => {
  await t.step("works on promises", async () => {
    const obj = {
      promise: Promise.resolve({ value: "hi" }),
    };
    const res = cloneDeep(obj);
    expect(res).not.toBe(obj);
    expect(Object.keys(res)).toEqual(Object.keys(obj));
    expect(res.promise).toBeInstanceOf(Promise);
    // expect(res.promise).not.toBe(obj.promise);
    expect(await res.promise).toEqual({ value: "hi" });
  });
});

Deno.test("can encode superjson types", async (t) => {
  const app = new Spiceflow().post("/superjson", () => {
    const item = {
      date: new Date("2025-01-20T18:01:57.852Z"),
      map: new Map([["a", 1]]),
      set: new Set([1, 2, 3]),
      bigint: BigInt(123),
    };
    return { items: Array(2).fill(item) };
  });
  const res = await app.handle(
    new Request("http://localhost/superjson", { method: "POST" }),
  );
  expect(res.status).toBe(200);
  const client = createSpiceflowClient(app);
  await assertSnapshot(t, await client.superjson.post().then((x) => x.data));
  await assertSnapshot(t, await res.json());
});
Deno.test("dynamic route", async () => {
  const res = await new Spiceflow()
    .post("/ids/:id", () => "hi")
    .handle(new Request("http://localhost/ids/xxx", { method: "POST" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual("hi");
});
Deno.test("handler returns url encoded data", async () => {
  const params = new URLSearchParams();
  params.append("name", "test");
  params.append("value", "123");

  const res = await new Spiceflow()
    .post("/form", () => params, {
      type: "application/x-www-form-urlencoded",
    })
    .handle(
      new Request("http://localhost/form", {
        method: "POST",
      }),
    );

  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe(
    "application/x-www-form-urlencoded",
  );
  const text = await res.text();
  const responseParams = new URLSearchParams(text);
  expect(responseParams.get("name")).toBe("test");
  expect(responseParams.get("value")).toBe("123");
});
Deno.test("GET dynamic route", async () => {
  const res = await new Spiceflow()
    .get("/ids/:id", () => "hi")
    .post("/ids/:id", ({ params: { id } }) => id, {
      params: z.object({ id: z.string() }),
    })
    .handle(new Request("http://localhost/ids/xxx", { method: "GET" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual("hi");
});

Deno.test("onError does not fire on 404", async () => {
  let errorFired = false;
  const app = new Spiceflow()
    .get("/test", () => "Hello")
    .onError(() => {
      errorFired = true;
      return new Response("Error", { status: 500 });
    });

  const res = await app.handle(
    new Request("http://localhost/non-existent", { method: "GET" }),
  );

  expect(res.status).toBe(404);
  expect(errorFired).toBe(false);
  expect(await res.text()).toBe("Not Found");
});

Deno.test("onError fires on validation errors", async () => {
  let errorMessage = "";
  const app = new Spiceflow()
    .post(
      "/test",
      async ({ request }) => {
        await request.json();
        return "Success";
      },
      {
        body: z.object({
          name: z.string(),
        }),
      },
    )
    .onError(({ error }) => {
      errorMessage = error.message;
      return new Response("Error", { status: 400 });
    });

  const res = await app.handle(
    new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: 1 }), // Invalid type for 'name'
    }),
  );

  expect(res.status).toBe(400);
  expect(errorMessage).toEqual("name: Expected string, received number");
  expect(await res.text()).toEqual("Error");
});

/*
Deno.test("HEAD uses GET route, does not add body", async () => {
  const app = new Spiceflow().get("/ids/:id", () => {
    console.trace("GET");
    return {
      message: "hi",
      length: 10,
    };
  });

  const res = await app.handle(
    new Request("http://localhost/ids/xxx", { method: "HEAD" }),
  );
  expect(res.status).toBe(200);
  // expect(res.headers.get('Content-Length')).toBe('10')
  expect(await res.text()).toBe("");

  // Compare with GET to ensure HEAD is using GET route
  const getRes = await app.handle(
    new Request("http://localhost/ids/xxx", { method: "GET" }),
  );
  expect(getRes.status).toBe(200);
  expect(await getRes.json()).toEqual({ message: "hi", length: 10 });
});
*/

Deno.test("GET with query, untyped", async () => {
  const res = await new Spiceflow()
    .get("/query", ({ query }) => {
      return query.id;
    })
    .handle(new Request("http://localhost/query?id=hi", { method: "GET" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual("hi");
});

Deno.test("GET with query, zod, fails validation", async () => {
  const res = await new Spiceflow()
    .get(
      "/query",
      ({ query }) => {
        return query.id;
      },
      {
        query: z.object({
          id: z.number(),
        }),
      },
    )
    .handle(new Request("http://localhost/query?id=hi", { method: "GET" }));
  expect(res.status).toBe(422);
});

Deno.test("GET with query and zod", async () => {
  const res = await new Spiceflow()
    .get(
      "/query",
      ({ query }) => {
        // @ts-expect-error
        void query.sdfsd;
        return query.id;
      },
      {
        query: z.object({
          id: z.string(),
        }),
      },
    )
    .handle(new Request("http://localhost/query?id=hi", { method: "GET" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual("hi");
});

Deno.test("GET dynamic route, params are typed", async () => {
  const res = await new Spiceflow()
    .get("/ids/:id", ({ params }) => {
      const id = params.id;
      // @ts-expect-error
      params.sdfsd;
      return id;
    })
    .handle(new Request("http://localhost/ids/hi", { method: "GET" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual("hi");
});

Deno.test("GET dynamic route, params are typed with schema", async () => {
  const res = await new Spiceflow()
    .get(
      "/ids/:id",
      ({ params }) => {
        const id = params.id;
        // @ts-expect-error
        params.sdfsd;
        return id;
      },
      {
        params: z.object({
          id: z.string(),
        }),
      },
    )
    .handle(new Request("http://localhost/ids/hi", { method: "GET" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual("hi");
});

Deno.test("missing route is not found", async () => {
  const res = await new Spiceflow()
    .get("/ids/:id", () => "hi")
    .handle(new Request("http://localhost/zxxx", { method: "GET" }));
  expect(res.status).toBe(404);
});
Deno.test("state works", async () => {
  const res = await new Spiceflow()
    .state("id", "")
    .use(({ state }) => {
      state.id = "xxx";
    })
    .get("/get", ({ state: state }) => {
      expect(state.id).toBe("xxx");
    })
    .handle(new Request("http://localhost/get"));
  expect(res.status).toBe(200);
});

Deno.test("body is parsed as json", async () => {
  let body;
  const res = await new Spiceflow()
    .state("id", "")
    .post("/post", async (c) => {
      body = await c.request.json();
      // console.log({request})
      return body;
    })
    .handle(
      new Request("http://localhost/post", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "John" }),
      }),
    );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ name: "John" });
});

Deno.test("validate body works, request success", async () => {
  const res = await new Spiceflow()
    .post(
      "/post",
      async ({ request }) => {
        // console.log({request})
        const body = await request.json();
        expect(body).toEqual({ name: "John" });
        return "ok";
      },
      {
        body: z.object({
          name: z.string(),
        }),
      },
    )
    .handle(
      new Request("http://localhost/post", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "John" }),
      }),
    );
  expect(res.status).toBe(200);
  expect(await res.text()).toEqual('"ok"');
});

Deno.test("validate body works, request fails", async () => {
  const res = await new Spiceflow()
    .post(
      "/post",
      async ({ request }) => {
        // console.log({request})
        const body = await request.json();
        expect(body).toEqual({ name: "John" });
      },
      {
        body: z.object({
          name: z.string(),
          requiredField: z.string(),
        }),
      },
    )
    .handle(
      new Request("http://localhost/post", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "John" }),
      }),
    );
  expect(res.status).toBe(422);
  expect(await res.text()).toEqual(
    JSON.stringify({
      "code": "VALIDATION",
      "status": 422,
      "message": "requiredField: Required",
    }),
  );
});

Deno.test("run use", async () => {
  const res = await new Spiceflow()
    .use(({ request }) => {
      expect(request.method).toBe("HEAD");
      return new Response("ok", { status: 401 });
    })
    .use(({ request }) => {
      expect(request.method).toBe("HEAD");
      return "second one";
    })
    .head("/ids/:id", () => "hi")
    .handle(new Request("http://localhost/ids/zxxx", { method: "HEAD" }));
  expect(res.status).toBe(401);
  expect(await res.text()).toBe("ok");
});

Deno.test("run use", async () => {
  const res = await new Spiceflow()
    .use(({ request }) => {
      expect(request.method).toBe("HEAD");
      return new Response("ok", { status: 401 });
    })
    .use(({ request }) => {
      expect(request.method).toBe("HEAD");
      return "second one";
    })
    .head("/ids/:id", () => "hi")
    .handle(new Request("http://localhost/ids/zxxx", { method: "HEAD" }));
  expect(res.status).toBe(401);
  expect(await res.text()).toBe("ok");
});

Deno.test("basPath works", async () => {
  const res = await new Spiceflow({ basePath: "/one" })
    .get("/ids/:id", () => "hi")
    .handle(new Request("http://localhost/one/ids/xxx", { method: "GET" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual("hi");
});

Deno.test("basPath works with use", async () => {
  const app = new Spiceflow({ basePath: "/one" }).use(
    new Spiceflow({})
      .get("/two", () => "hi")
      .use(new Spiceflow({ basePath: "/three" }).get("/four", () => "hi")),
  );
  {
    const res = await app.handle(
      new Request("http://localhost/one/two", { method: "GET" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual("hi");
  }
  {
    const res = await app.handle(
      new Request("http://localhost/one/three/four", { method: "GET" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual("hi");
  }
});

Deno.test("getRouteAndParents", async () => {
  const app = new Spiceflow({ basePath: "/one" })
    .get("/ids/:id", () => "hi")
    .use(
      new Spiceflow({ basePath: "/two" }).use(
        new Spiceflow({ basePath: "/three" }).get("/four", () => "hi"),
      ),
    );

  const routers = bfs(app);
  const last = routers[routers.length - 1];

  expect(app["getAppAndParents"](last).map((x) => x.prefix))
    .toEqual(["/one", "/two", "/three"]);
});

Deno.test("getAppsInScope include all parent apps", async () => {
  const app = new Spiceflow({ basePath: "/one" })
    .get("/ids/:id", () => "hi")
    .use(
      new Spiceflow({ basePath: "/two" }).use(
        new Spiceflow({ basePath: "/three" }).use(
          new Spiceflow({ basePath: "/four" })
            .get("/five", () => "hi")
            .use(() => {}),
        ),
      ),
    );

  const routers = bfs(app);
  const secondLast = routers[routers.length - 2];

  expect(app["getAppsInScope"](secondLast).map((x) => x.prefix))
    .toEqual(["/one", "/two", "/three"]);
});

Deno.test("getAppsInScope include all parent apps and non scoped apps", async () => {
  const app = new Spiceflow({ basePath: "/one" })
    .get("/ids/:id", () => "hi")
    .use(
      new Spiceflow({ basePath: "/two" }).use(
        new Spiceflow({ basePath: "/three" }).use(
          new Spiceflow({ basePath: "/four", scoped: false })
            .get("/five", () => "hi")
            .use(() => {}),
        ),
      ),
    );

  const routers = bfs(app);
  const secondLast = routers[routers.length - 2];

  expect(app["getAppsInScope"](secondLast).map((x) => x.prefix))
    .toEqual(["/one", "/two", "/three", "/four"]);
});

Deno.test("use with 2 basPath works", async () => {
  let oneOnReq = false;
  let twoOnReq = false;
  const onReqCalled: string[] = [];
  const app = new Spiceflow()
    .use(() => {
      onReqCalled.push("root");
    })
    .use(
      new Spiceflow({ basePath: "/one" })
        .use(() => {
          oneOnReq = true;
          onReqCalled.push("one");
        })
        .get("/ids/:id", ({ params }) => params.id),
    )
    .use(
      new Spiceflow({ basePath: "/two" })
        .use(() => {
          twoOnReq = true;
          onReqCalled.push("two");
        })
        .get("/ids/:id", ({ params }) => params.id, {}),
    );

  {
    const res = await app.handle(new Request("http://localhost/one/ids/one"));
    expect(res.status).toBe(200);

    expect(await res.json()).toEqual("one");
  }
  expect(onReqCalled).toEqual(["root", "one"]);
  {
    const res = await app.handle(new Request("http://localhost/two/ids/two"));
    expect(res.status).toBe(200);

    expect(await res.json()).toEqual("two");
  }
  expect(oneOnReq).toBe(true);
  expect(twoOnReq).toBe(true);
});

Deno.test("use with nested basPath works", async () => {
  const app = await new Spiceflow({ basePath: "/zero" })
    .use(
      new Spiceflow({ basePath: "/one" }).get(
        "/ids/:id",
        ({ params }) => params.id,
      ),
    )
    .use(
      new Spiceflow({ basePath: "/two" }).use(
        new Spiceflow({ basePath: "/nested" }).get(
          "/ids/:id",
          ({ params }) => params.id,
        ),
      ),
    );
  {
    const res = await app.handle(
      new Request("http://localhost/zero/one/ids/one"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual("one");
  }

  {
    const res = await app.handle(
      new Request("http://localhost/zero/two/nested/ids/nested"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual("nested");
  }
});

Deno.test("errors inside basPath works", async () => {
  const onErrorTriggered = [] as string[];
  const onReqTriggered = [] as string[];
  let handlerCalledNTimes = 0;
  const app = new Spiceflow({ basePath: "/zero" })
    .onError(() => {
      onErrorTriggered.push("root");
      // return new Response('root', { status: 500 })
    })
    .use(() => {
      onReqTriggered.push("root");
      // return new Response('root', { status: 500 })
    })
    .use(
      new Spiceflow({ basePath: "/two" })
        .onError(() => {
          onErrorTriggered.push("two");
          // return new Response('two', { status: 500 })
        })
        .use(() => {
          onReqTriggered.push("two");
          // return new Response('two', { status: 500 })
        })
        .use(
          new Spiceflow({ basePath: "/nested" })
            .onError(() => {
              onErrorTriggered.push("nested");
              // return new Response('nested', { status: 500 })
            })
            .use(() => {
              onReqTriggered.push("nested");
              // return new Response('nested', { status: 500 })
            })
            .get("/ids/:id", () => {
              handlerCalledNTimes++;
              throw new Error("error message");
            }),
        ),
    );

  {
    const res = await app.handle(
      new Request("http://localhost/zero/two/nested/ids/nested"),
    );
    expect(handlerCalledNTimes).toBe(1);
    expect(onErrorTriggered).toEqual(["root", "two", "nested"]);
    expect(onReqTriggered).toEqual(["root", "two", "nested"]);
    expect(res.status).toBe(500);
    expect(await res.text()).toEqual('{"message":"error message"}');
    // expect(await res.json()).toEqual('nested'))
  }
});

Deno.test("basepath with root route", async () => {
  let handlerCalled = false;
  const app = new Spiceflow({ basePath: "/api" }).get("/", () => {
    handlerCalled = true;
    return new Response("Root route of API");
  });

  const res = await app.handle(new Request("http://localhost/api"));
  expect(handlerCalled).toBe(true);
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("Root route of API");

  // Test that non-root paths are not matched
  handlerCalled = false;
  const res2 = await app.handle(new Request("http://localhost/api/other"));
  expect(handlerCalled).toBe(false);
  expect(res2.status).toBe(404);
});

Deno.test("Trailing slashes and base paths", async (t) => {
  await t.step(
    "App without trailing slash, request with trailing slash",
    async () => {
      const app = new Spiceflow({ basePath: "/api" }).get(
        "/users",
        () => new Response("Users list"),
      );

      const res = await app.handle(new Request("http://localhost/api/users/"));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("Users list");
    },
  );

  await t.step(
    "App with trailing slash, request without trailing slash",
    async () => {
      const app = new Spiceflow({ basePath: "/api/" }).get(
        "/users/",
        () => new Response("Users list"),
      );

      const res = await app.handle(new Request("http://localhost/api/users"));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("Users list");
    },
  );

  await t.step("Nested routes with and without trailing slashes", async () => {
    const app = new Spiceflow({ basePath: "/api" }).use(
      new Spiceflow()
        .get("/products", () => new Response("Products list"))
        .get("/categories/", () => new Response("Categories list")),
    );

    const resProducts = await app.handle(
      new Request("http://localhost/api/products/"),
    );
    expect(resProducts.status).toBe(200);
    expect(await resProducts.text()).toBe("Products list");

    const resCategories = await app.handle(
      new Request("http://localhost/api/categories"),
    );
    expect(resCategories.status).toBe(200);
    expect(await resCategories.text()).toBe("Categories list");
  });
});

Deno.test("async generators handle non-ASCII characters correctly", async () => {
  const app = new Spiceflow()
    .get("/cyrillic", async function* () {
      yield "Привет"; // Hello in Russian
      yield "Κόσμος"; // World in Greek
    })
    .get("/mixed-scripts", async function* () {
      // Mix of Cyrillic and Greek letters that look like Latin
      yield { text: "РΡ" }; // Cyrillic and Greek P
      yield { text: "ΟО" }; // Greek and Cyrillic O
      yield { text: "КΚ" }; // Cyrillic and Greek K
    });

  const client = createSpiceflowClient(app);

  const { data: cyrillicData } = await client.cyrillic.get();
  let cyrillicText = "";
  for await (const chunk of cyrillicData!) {
    cyrillicText += chunk;
  }
  expect(cyrillicText).toBe("ПриветΚόσμος");

  const { data: mixedData } = await client["mixed-scripts"].get();
  const mixedResults = [] as any[];
  for await (const chunk of mixedData!) {
    mixedResults.push(chunk);
  }
  expect(mixedResults).toEqual([{ text: "РΡ" }, { text: "ΟО" }, {
    text: "КΚ",
  }]);
});

Deno.test("can pass additional props to body schema", async () => {
  const app = new Spiceflow().post("/user", ({ request }) => request.json(), {
    body: z
      .object({
        name: z.string(),
        age: z.number(),
        email: z.string().email(),
      })
      .passthrough(),
  });

  const res = await app.handle(
    new Request("http://localhost/user", {
      method: "POST",

      body: JSON.stringify({
        name: "John",
        age: 25,
        email: "john@example.com",
        additionalProp: "extra data",
      }),
    }),
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    name: "John",
    age: 25,
    email: "john@example.com",
    additionalProp: "extra data",
  });
});
