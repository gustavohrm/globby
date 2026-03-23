export default {
  async fetch(): Promise<Response> {
    return new Response(JSON.stringify({ message: 'Hello World' }));
  },
};
