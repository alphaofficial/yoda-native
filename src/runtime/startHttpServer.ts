import type { Server } from 'node:http';

import { Bus } from '@/primitives/bus';
import { createApp } from '@/router/app';

export type RunningHttpServer = {
	url: string;
	server: Server;
	stop(): Promise<void>;
};

export async function startHttpServer(port = 0): Promise<RunningHttpServer> {
	const { app, ctx } = await createApp();

	const server = await new Promise<Server>((resolve, reject) => {
		const listeningServer = app.listen(port, '127.0.0.1', () => {
			resolve(listeningServer);
		});

		listeningServer.once('error', reject);
	});

	Bus.start();

	const address = server.address();

	if (!address || typeof address === 'string') {
		throw new Error('Unable to determine HTTP server address');
	}

	return {
		server,
		url: `http://127.0.0.1:${address.port}`,

		async stop(): Promise<void> {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}

					resolve();
				});
			});

			await ctx.db.getConnection().close(true);
		},
	};
}
