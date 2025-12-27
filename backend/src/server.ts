import app from './app';

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

app.listen(port, host, () => {
  console.log(`Flipstarter backend listening on http://${host}:${port}`);
});
