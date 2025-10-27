// Silence console.error during tests to keep output clean. The Fastify
// logger may write errors when shutting down or when plugins throw.
jest.spyOn(console, 'error').mockImplementation(() => {});