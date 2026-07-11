export const metadata = {
  title: "Enrolment Pulse",
  description: "Daily Meritto lead sync and dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#101418",
          color: "#E8EAED",
          fontFamily:
            "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
