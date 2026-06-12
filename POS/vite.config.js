import path from "node:path"
import { promises as fs } from "node:fs"
import vue from "@vitejs/plugin-vue"
import frappeui from "frappe-ui/vite"
import { defineConfig } from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"

// Get build version from environment or use timestamp
const buildVersion = process.env.POS_NEXT_BUILD_VERSION || Date.now().toString()
const enableSourceMap = process.env.POS_NEXT_ENABLE_SOURCEMAP === "true"

/**
 * Vite plugin to write build version to version.json file
 */
function posNextBuildVersionPlugin(version) {
	return {
		name: "pos-next-build-version",
		apply: "build",
		async writeBundle() {
			const versionFile = path.resolve(__dirname, "../pos_next/public/pos/version.json")
			await fs.mkdir(path.dirname(versionFile), { recursive: true })
			await fs.writeFile(
				versionFile,
				JSON.stringify(
					{
						version,
						timestamp: new Date().toISOString(),
						buildDate: new Date().toLocaleDateString("en-US", {
							year: "numeric",
							month: "long",
							day: "numeric",
						}),
					},
					null,
					2
				),
				"utf8"
			)
			console.log(`\n✓ Build version written: ${version}`)
		},
	}
}

export default defineConfig({
	plugins: [
		posNextBuildVersionPlugin(buildVersion),
		frappeui({
			frappeProxy: true,
			jinjaBootData: true,
			lucideIcons: true,
			buildConfig: {
				indexHtmlPath: "../pos_next/www/pos.html",
				outDir: "../pos_next/public/pos",
				emptyOutDir: true,
				sourcemap: enableSourceMap,
			},
		}),
		vue(),
		viteStaticCopy({
			targets: [
				{
					src: "src/workers",
					dest: ".",
				},
				// ← Copy our custom SW to the build output root
				{
					src: "public/sw.js",
					dest: ".",
				},
			],
		}),
	],
	build: {
		chunkSizeWarningLimit: 1500,
		outDir: "../pos_next/public/pos",
		emptyOutDir: true,
		target: "es2015",
		sourcemap: enableSourceMap,
	},
	worker: {
		format: "es",
		rollupOptions: {
			output: {
				format: "es",
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			"tailwind.config.js": path.resolve(__dirname, "tailwind.config.js"),
		},
	},
	define: {
		__BUILD_VERSION__: JSON.stringify(buildVersion),
	},
	optimizeDeps: {
		include: [
			"feather-icons",
			"showdown",
			"highlight.js/lib/core",
			"interactjs",
			"qz-tray",
		],
	},
	server: {
		allowedHosts: true,
		port: 8080,
		proxy: {
			"^/(app|api|assets|files|printview)": {
				target: "http://127.0.0.1:8000",
				ws: true,
				changeOrigin: true,
				secure: false,
				cookieDomainRewrite: "localhost",
				router: (req) => {
					const site_name = req.headers.host.split(":")[0]
					const isLocalhost = site_name === "localhost" || site_name === "127.0.0.1"
					const targetHost = isLocalhost ? "127.0.0.1" : site_name
					return `http://${targetHost}:8000`
				},
			},
		},
	},
})
