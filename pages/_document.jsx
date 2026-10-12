import Document, { Head, Html, Main, NextScript } from "next/document";

// Document shell (TASK-063): language, viewport and visible keyboard focus.
// Pages Router has no layout file, so these live here once for every page.
export default function SalonDocument() {
  return (
    <Html lang="en-CA">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          :focus-visible {
            outline: 3px solid #2c6b3f;
            outline-offset: 2px;
            border-radius: 4px;
          }
          @media (max-width: 640px) {
            main { padding-left: 4vw !important; padding-right: 4vw !important; }
          }
        `}</style>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
