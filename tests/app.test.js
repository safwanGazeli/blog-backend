jest.mock("../config/cloudinary", () => ({
  uploader: {
    destroy: jest.fn().mockResolvedValue({ result: "ok" }),
  },
}));

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const cloudinary = require("../config/cloudinary");

describe("Fullstack Blog app", () => {
  let app;
  let mongoServer;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret";
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";

    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URL = mongoServer.getUri();

    app = require("../app");
    await mongoose.connect(process.env.MONGODB_URL);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    const sessionStore = app.get("sessionStore");
    if (sessionStore && typeof sessionStore.close === "function") {
      await sessionStore.close();
    }

    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test.each([
    ["/", "Welcome to My Blog"],
    ["/auth/login", "Login"],
    ["/auth/register", "Register"],
    ["/posts", "No posts available."],
  ])("renders public page %s", async (path, expectedText) => {
    const response = await request(app).get(path);

    expect(response.statusCode).toBe(200);
    expect(response.text).toContain(expectedText);
  });

  test("redirects anonymous users away from protected profile page", async () => {
    const response = await request(app).get("/user/profile");

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/auth/login");
  });

  test("registers a new user with a hashed password", async () => {
    const response = await request(app).post("/auth/register").type("form").send({
      username: "Test User",
      email: "test@example.com",
      password: "password123",
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/auth/login");

    const User = require("../models/User");
    const user = await User.findOne({ email: "test@example.com" });

    expect(user).toBeTruthy();
    expect(user.username).toBe("Test User");
    expect(user.password).not.toBe("password123");
  });

  test("logs in a registered user and renders their profile", async () => {
    const agent = request.agent(app);

    await agent.post("/auth/register").type("form").send({
      username: "Session User",
      email: "session@example.com",
      password: "password123",
    });

    const loginResponse = await agent.post("/auth/login").type("form").send({
      email: "session@example.com",
      password: "password123",
    });

    expect(loginResponse.statusCode).toBe(302);
    expect(loginResponse.headers.location).toBe("/user/profile");

    const profileResponse = await agent.get("/user/profile");

    expect(profileResponse.statusCode).toBe(200);
    expect(profileResponse.text).toContain("Session User");
  });

  test("lets an authenticated author delete their post and Cloudinary image", async () => {
    const agent = request.agent(app);

    await agent.post("/auth/register").type("form").send({
      username: "Post Author",
      email: "author@example.com",
      password: "password123",
    });

    await agent.post("/auth/login").type("form").send({
      email: "author@example.com",
      password: "password123",
    });

    const User = require("../models/User");
    const Post = require("../models/Post");
    const user = await User.findOne({ email: "author@example.com" });
    const post = await Post.create({
      title: "Post to delete",
      content: "This post should be deleted by its author.",
      author: user._id,
      images: [
        {
          url: "https://example.com/image.jpg",
          public_id: "post-image-public-id",
        },
      ],
    });

    const response = await agent.delete(`/posts/${post._id}`);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/posts");
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      "post-image-public-id"
    );
    expect(await Post.findById(post._id)).toBeNull();
  });
});
