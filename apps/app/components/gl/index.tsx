"use client";

import { Effects } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useTheme } from "next-themes";
import { Particles } from "./particles";
import { VignetteShader } from "./shaders/vignetteShader";

export const GL = ({ hovering = false }: { hovering?: boolean }) => {
  const { theme, resolvedTheme } = useTheme();
  const currentTheme = resolvedTheme || theme;
  const isDark = currentTheme === "dark";

  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <Canvas
        camera={{
          position: [1.26, 2.66, -1.82],
          fov: 50,
          near: 0.01,
          far: 300,
        }}
      >
        <color attach="background" args={[isDark ? "#07070a" : "#ffffff"]} />
        <Particles
          speed={1.0}
          aperture={1.79}
          focus={3.8}
          size={512}
          noiseScale={0.6}
          noiseIntensity={0.52}
          timeScale={1}
          pointSize={isDark ? 10.0 : 8.0}
          opacity={isDark ? 0.8 : 0.5}
          planeScale={10.0}
          useManualTime={false}
          manualTime={0}
          introspect={hovering}
        />
        <Effects multisamping={0} disableGamma>
          <shaderPass
            args={[VignetteShader]}
            uniforms-darkness-value={isDark ? 1.5 : 1.2}
            uniforms-offset-value={0.4}
          />
        </Effects>
      </Canvas>
    </div>
  );
};