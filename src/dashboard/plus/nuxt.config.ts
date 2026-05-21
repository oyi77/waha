export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: false },
  ssr: false,

  app: {
    baseURL: "/dashboard/",
    buildAssetsDir: "/_nuxt/",
    head: {
      title: "WAHA Dashboard",
      link: [
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "/dashboard/favicon.svg",
        },
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap",
        },
      ],
    },
  },

  css: ["~/assets/css/main.css"],

  nitro: {
    preset: "static",
  },
});
