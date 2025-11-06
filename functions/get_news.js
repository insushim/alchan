
const admin = require('firebase-admin');
const serviceAccount = require('../firebase/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function getLatestNews() {
  try {
    const newsSnapshot = await db.collection('CentralNews').orderBy('timestamp', 'desc').limit(5).get();
    if (newsSnapshot.empty) {
      console.log('No news found.');
      return;
    }
    newsSnapshot.forEach(doc => {
      console.log(doc.id, '=>', doc.data());
    });
  } catch (error) {
    console.error('Error getting news:', error);
  } finally {
    process.exit(0);
  }
}

getLatestNews();
