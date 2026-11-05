/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["nodemailer"],
  // A checagem de tipos roda no nosso `npm run typecheck`. Na hospedagem (Linux antigo, pouca memória) ela só atrapalha o build.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
