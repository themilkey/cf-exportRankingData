// [START import]
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp()
// [END import]

exports.exportRankingData = functions.storage.object().onFinalize(async (object) => {
	const fileBucket = object.bucket; // The Storage bucket that contains the file.
	const filePath = object.name; // File path in the bucket.
	var database = [];

	if (!filePath.endsWith('MatchDto.json')) {
		return console.log('This is not MatchDto.json');
	}

	const bucket = admin.storage().bucket(fileBucket);
	bucket.file(filePath).download().then(function(data) {
		var data = JSON.parse(data[0].toString());
		console.log('gameId is ', data.gameId)
		var bk = 0, rk = 0;
		data.participants.forEach(function(p, i) {
			var summonerName = data.participantIdentities[i].player.summonerName
				var player = { [summonerName] : {
					"gameId": data.gameId,
					"side": p.teamId,
					"kills": p.stats.kills,
					"deaths": p.stats.deaths,
					"assists": p.stats.assists,
					"dpm": p.stats.totalDamageDealtToChampions / (data.gameDuration / 60.0),
					"kp": 0
				}
			}
			if (player[summonerName].side == 100) {bk += player[summonerName].kills;} else {rk += player[summonerName].kills;}
			database.push(player);
		
		});
		database.forEach(p => {
			var key; for (var k in p) {key = k;}
			var totalkills;
			if (p[key].side == 100) {totalkills = bk;} else {totalkills = rk;}
			p[key].kp = ((p[key].kills + p[key].assists) / totalkills)*100.0
		});

		database.forEach(p => {
			var summonerName;
			for (var k in p)  {summonerName = k;}
			var key = p[summonerName].gameId;
			delete p[summonerName].side;
			delete p[summonerName].gameId;
			var fields = {[key]: p[summonerName]}
			admin.firestore().collection('data').doc(summonerName).set(fields, {merge: true});
		});
	});
});
// [END generateThumbnail]
