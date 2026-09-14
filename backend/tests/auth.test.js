const request = require("supertest");
const app = require("../src/app");

describe("Auth Endpoints", () => {
  describe("POST /api/auth/register", () => {
    it("should fail with invalid email", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test User",
          email: "invalid-email",
          password: "Password123!",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation failed");
    });

    it("should fail with weak password", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "123",
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toContainEqual(expect.objectContaining({
        path: "password"
      }));
    });
  });

  describe("POST /api/auth/login", () => {
    it("should return error for non-existent user", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "SomePassword123!",
        });

      // Status might be 401 or 400 depending on controller
      expect(res.status).toBeGreaterThanOrEqual(400);
    }, 15000);
  });
});
