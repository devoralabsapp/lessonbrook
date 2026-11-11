import { expect, test } from "@playwright/test";
import { googleToken, origin } from "../integration/helpers";

test("360px: hướng dẫn công khai, manifest/icon hợp lệ và trang riêng không cache", async ({
  page,
  context,
}) => {
  const businessRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      businessRequests.push(request.method());
  });
  await page.goto("/help");
  await expect(
    page.getByRole("heading", { name: "Dùng sổ nhẹ nhàng mỗi ngày" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Trong hướng dẫn" })
    .getByRole("link", { name: "Thêm vào màn hình chính" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Thêm LessonBrook vào màn hình chính" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const client = await context.newCDPSession(page);
  const parsed = await client.send("Page.getAppManifest");
  expect(parsed.errors).toEqual([]);
  const manifest = JSON.parse(parsed.data!);
  expect(manifest).toMatchObject({
    id: "/",
    scope: "/",
    start_url: "/app",
    display: "standalone",
    lang: "vi",
  });
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(
      (icon: { sizes: string; purpose: string }) =>
        icon.sizes === `${size}x${size}` && icon.purpose === "any",
    );
    expect(icon.type).toBe("image/png");
    expect(
      await page.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, icon.src),
    ).toEqual([size, size]);
  }
  const maskable = manifest.icons.find(
    (icon: { purpose: string }) => icon.purpose === "maskable",
  );
  const safeMark = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    const size = (canvas.width = canvas.height = image.naturalWidth);
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, size, size);
    let farthest = 0,
      opaque = true;
    for (let pixel = 0; pixel < size * size; pixel++) {
      const offset = pixel * 4;
      opaque &&= data[offset + 3] === 255;
      if (
        data[offset] > 100 &&
        data[offset + 1] > 150 &&
        data[offset + 2] > 100
      )
        farthest = Math.max(
          farthest,
          Math.hypot(
            (pixel % size) - size / 2,
            Math.floor(pixel / size) - size / 2,
          ),
        );
    }
    return { size, opaque, ratio: farthest / size };
  }, maskable.src);
  expect(safeMark).toMatchObject({ size: 512, opaque: true });
  expect(safeMark.ratio).toBeGreaterThan(0);
  expect(safeMark.ratio).toBeLessThan(0.4);
  const apple = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");
  expect(
    await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src!;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, apple),
  ).toEqual([180, 180]);
  await client.detach();
  await page
    .getByRole("link", { name: "Dữ liệu & quyền riêng tư", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dữ liệu trong sổ của bạn" }),
  ).toBeVisible();
  expect(businessRequests).toEqual([]);
  expect(
    await page.evaluate(async () => ({
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      caches: await caches.keys(),
    })),
  ).toEqual({ workers: 0, caches: [] });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const path of [
    "/app",
    "/app/students",
    "/onboarding",
    "/api/onboarding",
  ]) {
    const response = await context.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(path.startsWith("/api/") ? 401 : 307);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  }
});

test("360px: bàn phím vào nội dung, dialog giữ/trả focus, mất mạng giữ form rồi lưu đúng một lần", async ({
  page,
  context,
}) => {
  const token = await googleToken();
  const { token: csrf } = await (
    await context.request.get("/api/auth/csrf")
  ).json();
  expect(
    (
      await context.request.post("/api/auth/session", {
        headers: { Origin: origin, "x-csrf-token": csrf },
        data: { idToken: token.idToken },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/app/students");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Đến nội dung" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Đến nội dung" })).toHaveCSS(
    "outline-style",
    "solid",
  );
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(
    page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("link", { name: "Học viên" }),
  ).toHaveAttribute("aria-current", "page");
  const trigger = page
    .getByRole("button", { name: "Thêm học viên", exact: true })
    .first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Thêm học viên",
    exact: true,
  });
  await expect(dialog.getByLabel("Tên học viên")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Đóng biểu mẫu" }).focus();
  // Native dialogs may tab into browser chrome (reported as BODY); underlying
  // application controls must stay inert in both directions.
  for (const key of ["Shift+Tab", ...Array<string>(10).fill("Tab")]) {
    await page.keyboard.press(key);
    expect(
      await dialog.evaluate(
        (element) =>
          document.activeElement === document.body ||
          element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await expect(dialog.locator("form")).toHaveAttribute(
    "data-mobile-draft",
    "clean",
  );
  await dialog.getByLabel("Tên học viên").fill("Học viên bàn phím");
  await expect(dialog.locator("form")).toHaveAttribute(
    "data-mobile-draft",
    "dirty",
  );
  await context.setOffline(true);
  await dialog
    .getByRole("button", { name: "Lưu học viên", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText(
    "Chưa kết nối được máy chủ.",
  );
  await expect(dialog.getByLabel("Tên học viên")).toHaveValue(
    "Học viên bàn phím",
  );
  await expect(dialog.locator("form")).toHaveAttribute(
    "data-mobile-draft",
    "dirty",
  );
  await context.setOffline(false);
  await dialog
    .getByRole("button", { name: "Thử lưu lại", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Học viên bàn phím/ }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("link", { name: /Học viên bàn phím/ }),
  ).toHaveCount(1);
});
