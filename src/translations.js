import { match } from '@formatjs/intl-localematcher'
import { getUserLocales } from 'get-user-locale'

// todo: use a library for this
// when adding a language, also add the locale for it in helpers.js
const translations = {
	baseTitle: {
		de: '🇪🇺 Zug-Direktverbindungen',
		en: '🇪🇺 Direct train connections',
		fr: '🇪🇺 Connections directes',
	},
	searchPlaceholder: {
		de: 'Station suchen…',
		en: 'Search for a station…',
		fr: 'Chercher une gare…',
	},
	trainTypes: {
		de: 'Zugtyp',
		en: 'Train types',
		fr: 'Types de trains',
	},
	filterAllTrains: {
		de: 'Alle Züge',
		en: 'All trains',
		fr: 'Tous les trains',
	},
	filterRegionalTrains: {
		de: 'Nur Nahverkehr',
		en: 'Local and regional trains',
		fr: 'Trains locaux et régionaux',
	},
	maxDuration: {
		de: 'Max Dauer (min)',
		en: 'Max duration (min)',
		fr: 'Durée max (min)',
	},
	donationAlertTitle: {
		de: 'Dieses Projekt unterstützen',
		en: 'Support this project',
		fr: 'Aidez ce projet',
	},
	donationAlertMessage: {
		de: 'Dieses Projekt wird ehrenamtlich von Open-Source-Softwareentwickler:innen betrieben, und macht aufgrund der Kosten für Server und Kartografie-Kacheln jeden Monat Verluste. Wir wären daher über jede Spende sehr dankbar!',
		en: 'This project is maintained by open source developers in their spare time, who also use their private funds to cover operational costs for servers and map tiles. We are grateful for any donation!',
		fr: 'Ce projet est entretenu par des développeurs open source sur leur temps libre et leurs fonds personnels pour les coûts d\'hébergement des serveurs. Nous sommes reconnaissants pour toutes donations!',
	},
	donationAlertSkip: {
		de: 'Vielleicht später',
		en: 'Maybe later',
		fr: 'Plus tard',
	},
	donationAlertContinue: {
		de: 'Jetzt spenden',
		en: 'Donate now',
		fr: 'Donner',
	},
	redirectionAlertTitle: {
		de: 'Verbindungsdetails',
		en: 'Connection details',
		fr: 'Détails de connection',
	},
	redirectionAlertMessage: {
		de: 'Du kannst dir die gewählte Zugverbindung auf der Website der Deutschen Bahn anschauen, oder dich zum Preiskalender für diese Strecke weiterleiten lassen. Bitte beachte, dass der Kalender leider nur für von der DB beworbene Fernverkehrsverbindungen funktioniert, für alle anderen Verbindungen informiere dich bitte auf den Seiten der lokalen Betreiber.',
		en: 'You can check details for the selected train on the Deutsche Bahn (DB) website, or be forwarded to our price calendar for that route. Please note that the calendar only includes prices for tickes sold by DB Fernverkehr. Please check the corresponding vendor\'s website for all other connections.',
		fr: 'Vous pouvez vérifier les détails du train sélectionné sur le site de la Deutsche Bahn (DB), ou être redirigés vers notre calendrier de prix pour ce trajet. Ce calendrier n\'inclut que les tarifs pratiqués par DB Fernverkehr. Vérifiez sur le site du vendeur approprié pour toutes les autres connections.',
	},
	redirectionAlertLocalTrainWarning: {
		de: 'Bitte beachte außerdem, dass aus technischen Gründen einige Züge fälschlicherweise als Teil des Nahverkehrs angezeigt werden können, obwohl dort keine Nahverkehrstickets gelten (z.B. Flixtrain). Bitte beachte dazu auch die Hinweise auf bahn.de!',
		en: 'Furthermore, beware that (for technical reasons) some trains might be incorrectly categorized as local transit, even though local/regional fares don\'t apply (e.g. Flixtrain). Please refer to bahn.de for additional information!',
		fr: 'De plus, (pour des raisons techniques) certains trains peuvent être catégorisés comme transit local alors que les tarifs locaux/régionaux ne s\'appliquent pas (e.g. Flixtrain). Reférez vous à bahn.de pour plus d\'informations!',
	},
	redirectionAlertCancel: {
		de: 'Abbrechen',
		en: 'Cancel',
		fr: 'Annuler',
	},
	redirectionAlertCalendar: {
		de: 'Preiskalender (beta)',
		en: 'Price calendar (beta)',
		fr: 'Calendrier de prix (beta)',
	},
	redirectionAlertDb: {
		de: 'Auf bahn.de zeigen',
		en: 'Show on bahn.de',
		fr: 'Voir sur bahn.de',
	},
	loadingAlertTitle: {
		de: 'Lädt…',
		en: 'Loading…',
		fr: 'Chargement…',
	},
	loadingAlertMessage: {
		de: 'Verbindungen werden gesucht. Bei vielbefahrenen Stationen kann das bis zu 30 Sekunden dauern.',
		en: 'Looking up connections. This might take up to 30 seconds at highly frequented stations.',
		fr: 'Recherche des connections. Ceci peux prendre jusqu\'à 30 secondes sur de grandes gares.',
	},
	stationNotFoundAlertTitle: {
		de: 'Huch?!',
		en: 'Oops?!',
		fr: 'Aïe!',
	},
	stationNotFoundAlertMessage: {
		de: 'Leider konnte die gewählte Station nicht in der Liste der S-Bahn-, Regional- und Fernverkehrshalte gefunden werden, versuchen Sie es bitte mit einer anderen.',
		en: 'Unfortunately, the station you were looking for could not be found in our database. Please try a different one.',
		fr: 'Malheureusement, la gare que vous cherchez n\'a pas été trouvée dans notre base de données. Essayez-en une autre.',
	},
	noResultsAlertTitle: {
		de: 'Hmm…',
		en: 'Hmm…',
		fr: 'Hmm…',
	},
	noResultsAlertMessage: {
		de: 'Leider konnten für die Station, die du gesucht hast, keine Verbindungen gefunden werden.',
		en: 'Unfortunately, we couldn\'t find any connections for the station you selected.',
		fr: 'Malheureusement, nous n\'avons trouvé aucune connection pour cette gare.',
	},
	unknownErrorAlertTitle: {
		de: 'Huch?!',
		en: 'Oops?!',
		fr: 'Aïe!',
	},
	unknownErrorAlertMessage: {
		de: 'Leider ist ein unbekannter Fehler aufgetreten, bitte versuchen Sie es erneut oder kontaktieren Sie uns, falls der Fehler häufiger auftritt.',
		en: 'Unknown error. Please try again in a few moments or contact us, if the issue persists.',
		fr: 'Une erreur est survenue. Réessayez dans quelques instants ou contactez nous si le problème persiste.',
	},
}

const supportedLanguages = ['de', 'en', 'fr']
export const language = match(getUserLocales(), supportedLanguages, 'en')
export const translate = token => {
	const translation = translations[token]
	if (!translation) { console.error('missing translation for token'); return token }
	const translationForLanguage = translation[language]
	if (!translation) { console.error(`missing translation for token ${token} in language ${language}`); return translation.en || token }
	return translationForLanguage
}
