import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    webpack: (config) => {
        // Simpler approach to disable PostCSS processing
        if (config.module && config.module.rules) {
            config.module.rules.forEach((rule: any) => {
                if (rule.oneOf) {
                    rule.oneOf.forEach((oneOfRule: any) => {
                        if (Array.isArray(oneOfRule.use)) {
                            oneOfRule.use = oneOfRule.use.filter((loader: any) => {
                                return !(
                                    loader.loader &&
                                    typeof loader.loader === 'string' &&
                                    loader.loader.includes('postcss-loader')
                                );
                            });
                        }
                    });
                }
            });
        }

        return config;
    },
};

export default nextConfig;