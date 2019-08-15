const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.exportRankingData = functions.region('asia-northeast1').storage.object().onFinalize(async (object) => {
	const fileBucket = object.bucket;
	const filePath = object.name;
	
	if (!filePath.endsWith('MatchDto.json')) {
		return console.log('This is not MatchDto.json');
	}
	
	var teamName = filePath.split("/MatchDto.json")[0].split("_");
	
	const bucket = admin.storage().bucket(fileBucket);
	bucket.file(filePath).download().then((data) => {
		data = JSON.parse(data[0].toString());
		var database = [];
		var bk = 0, rk = 0;
		data.participants.forEach((p, i) => {
			var summonerName = data.participantIdentities[i].player.summonerName
				var player = { [summonerName] : {
					"championId": p.championId,
					"win": (data.teams[Math.floor(i / 5)].win === "Win") ? true : false,
					"gameId": data.gameId,
					"side": p.teamId,
					"kills": p.stats.kills,
					"deaths": p.stats.deaths,
					"assists": p.stats.assists,
					"dpm": p.stats.totalDamageDealtToChampions / (data.gameDuration / 60.0),
					"kp": 0
				}
			};
			if (player[summonerName].side === 100) {bk += player[summonerName].kills;} else {rk += player[summonerName].kills;}
			database.push(player);
		});
		database.forEach(p => {
			var key; for (var k in p) {key = k;}
			var totalkills;
			if (p[key].side === 100) {totalkills = bk;} else {totalkills = rk;}
			p[key].kp = ((p[key].kills + p[key].assists) / totalkills)*100.0;
		});

		database.forEach(p => {
			var summonerName;
			for (var k in p)  {summonerName = k;}
			var key = p[summonerName].gameId;
			if (p[summonerName].side === 100) {teamname = teamName[1];} else {teamname = teamName[2];}
			delete p[summonerName].side;
			delete p[summonerName].gameId;
			var fields = {[key]: p[summonerName], "team": teamname};
			admin.firestore().collection('data').doc(summonerName).set(fields, {merge: true});
		});

		return console.log('gameId is ', data.gameId);
	})
	.catch((err) => {
		return console.log(err);
	});
	
	return null;
});

exports.getRanking = functions.region('asia-northeast1').https.onRequest((request, response) => {
	response.set('Access-Control-Allow-Origin', '*');
	var tasks = [];

	var ranking = {"Kda":{}, "Dpm":{}, "Kp":{}};
	Object.keys(ranking).forEach(id => {
		tasks.push(admin.firestore().collection('average').orderBy(id, 'desc').limit(Number(request.query.limit)).get());
	})
	
	Promise.all(tasks).then((snapshot) => {
		snapshot.forEach((documents, index) => {
			var top = [];
			documents.forEach((doc, i) => {
				top.push({"name": doc.id, "team": doc.get("Team"), "score":doc.get(Object.keys(ranking)[index])});
			});
			ranking[Object.keys(ranking)[index]] = top;
		});
		return null
	})
	.then(() => {
		response.json(ranking);

		return null;
	})
	.catch((err) => {
		response.status(403).json({"error": err});
	});
});

exports.average = functions.region('asia-northeast1').firestore.document('data/{summonerName}').onWrite((change, context) => {
	const summonerName = context.params.summonerName;
	const document = change.after.exists ? change.after.data() : null;
	if (document === null) {return null;}

	var scores = {"assists": [], "deaths": [],"dpm": [],"kills": [],"kp": []}
	var teamName = "";
	Object.keys(document).forEach((key, index) => {
		if (key === 'team') {
			teamName = document[key];
		} else {
			scores.assists.push(document[key].assists);
			scores.deaths.push(document[key].deaths);
			scores.dpm.push(document[key].dpm);
			scores.kills.push(document[key].kills);
			scores.kp.push(document[key].kp);
		}
	});
	
	var average = function(x) {
		var sum = 0.0;
		x.forEach((y) => {
			sum += y;
		});
		return sum / x.length;
	}
	var sum = function(x) {
		var sum = 0.0;
		x.forEach((y) => {
			sum += y;
		});
		return sum
	}

	var kda = 0;
	if (Number(sum(scores.deaths)) === 0) {
		kda = (sum(scores.kills) + sum(scores.assists));
	} else {
		kda = (sum(scores.kills) + sum(scores.assists)) / sum(scores.deaths);
	}
	const dpm = average(scores.dpm);
	const kp = average(scores.kp);

	console.log('updated player average: ', summonerName);
	return admin.firestore().collection('average').doc(summonerName).set({"Kda": kda, "Dpm": dpm, "Kp": kp, "Team": teamName}, {merge: true});
});
