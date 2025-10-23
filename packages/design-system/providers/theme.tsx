import type { ThemeProviderProps } from 'next-themes';
import { ThemeProvider as NextThemeProvider } from 'next-themes';

export const ThemeProvider = ({
  children,
  ...properties
}: ThemeProviderProps) => (
  <NextThemeProvider
    attribute="class"
    defaultTheme="dark"          // ✅ ตั้งค่าให้ dark เป็น default เสมอ
    enableSystem={false}         // ✅ ปิดระบบ auto detect จาก OS
    disableTransitionOnChange
    {...properties}
  >
    {children}
  </NextThemeProvider>
);
