const m3u = require('m3u8-reader')
const needle = require('needle')
const { config } = require('internal')

const defaults = {
	name: 'M3U Playlists - Catalogs',
	prefix: 'm3uplaycat_',
	icon: 'https://enjoy.zendesk.com/hc/article_attachments/360004422752/2149-m3u-image.jpg',
	paginate: 100
}

function btoa(str) {
    var buffer;

    if (str instanceof Buffer) {
      buffer = str;
    } else {
      buffer = Buffer.from(str.toString(), 'binary');
    }

    return buffer.toString('base64');
}

function atob(str) {
    return Buffer.from(str, 'base64').toString('binary');
}

const m3us = {}

function getM3U(idx, url) {
	return new Promise((resolve, reject) => {
		if (m3us[url]) {
			resolve(m3us[url])
			return 
		}
		needle.get(url, (err, resp, body) => {
			if (!err && body) {
				const playlist = m3u(body)
				const metas = []
				let name
				playlist.forEach(line => {
					if (typeof line == 'string') {
						metas.push({
							id: defaults.prefix + 'url_' + idx + '_' + encodeURIComponent(btoa(line)),
							name,
							posterShape: 'square',
							type: 'tv'
						})
						name = false
					} else if (typeof line == 'object' && line.EXTINF) {
						for (let key in line.EXTINF)
							if (key != '-1 tvg-id' && !name)
								name = key
					}
				})

				if (metas.length)
					m3us[url] = metas
				resolve(metas)
			}
		})
	})
}

const catalogs = []
for (let i = 1; i < 6; i++)
	if (config['m3u_url_'+i])
		catalogs.push({
			name: config['m3u_name_'+i] || ('Unnamed #' + i),
			id: defaults.prefix + 'cat_' + i,
			type: 'tv',
			extra: [ { name: 'search' }, { name: 'skip' } ]
		})

const { addonBuilder, getInterface, getRouter } = require('stremio-addon-sdk')

const builder = new addonBuilder({
	id: 'org.' + defaults.name.toLowerCase().replace(/[^a-z]+/g,''),
	version: '1.0.0',
	name: defaults.name,
	description: 'Creates catalogs based on M3U Playlists. Add M3U playlists to Stremio by URL, supports a maximum of 5 playlists and custom names',
	resources: ['stream', 'meta', 'catalog'],
	types: ['tv', 'channel'],
	idPrefixes: [defaults.prefix],
	icon: defaults.icon,
	catalogs
})

builder.defineCatalogHandler(args => {
	return new Promise((resolve, reject) => {
		const extra = args.extra || {}
		const skip = parseInt(extra.skip || 0)
		const id = args.id.replace(defaults.prefix + 'cat_', '')
		getM3U(id, config['m3u_url_'+id]).then(metas => {
			if (!metas.length)
				reject(defaults.name + ' - Could not get items from M3U playlist: ' + args.id)
			else {
				if (!extra.search)
					resolve({ metas: metas.slice(skip, skip + defaults.paginate) })
				else {
					let results = []
					metas.forEach(meta => {
						if (meta.name.toLowerCase().includes(extra.search.toLowerCase()))
							results.push(meta)
					})
					if (results.length)
						resolve({ metas: results })
					else
						reject(defaults.name + ' - No search results for: ' + extra.search)
				}
			}
		}).catch(err => {
			reject(err)
		})
	})
})

builder.defineMetaHandler(args => {
	return new Promise((resolve, reject) => {
		const i = args.id.replace(defaults.prefix + 'url_', '').split('_')[0]
		getM3U(i, config['m3u_url_'+i]).then(metas => {
			let meta
			metas.some(el => {
				if (el.id == args.id) {
					meta = el
					return true
				}
			})
			if (meta)
				resolve({ meta })
			else
				reject(defaults.name + ' - Could not get meta item for: ' + args.id)
		}).catch(err => {
			reject(err)
		})
	})
})

builder.defineStreamHandler(args => {
	return new Promise((resolve, reject) => {
		const url = decodeURIComponent(atob(args.id.replace(defaults.prefix + 'url_', '').split('_')[1]))
		resolve({ streams: [{ url }] })
	})
})

const addonInterface = getInterface(builder)

module.exports = getRouter(addonInterface)
