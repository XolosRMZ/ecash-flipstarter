import app from "./app";

const PORT = process.env.API_PORT
  ? Number(process.env.API_PORT)
  : process.env.PORT
    ? Number(process.env.PORT)
    : 3000;

app.listen(PORT, () => {
  console.log(`Flipstarter backend listening on port ${PORT}`);
});
