"""Translate curated story labels; preserve original user/source text verbatim."""
NAMES_HI={"FIR and initial field report":"प्रथम सूचना और प्रारंभिक रिपोर्ट","Call detail records":"कॉल विवरण रिकॉर्ड","Financial transaction export":"वित्तीय लेन-देन रिकॉर्ड","Synthetic CCTV still":"काल्पनिक CCTV चित्र","Synthetic dispatch audio":"काल्पनिक प्रेषण ऑडियो","Synthetic CCTV clip":"काल्पनिक CCTV क्लिप","Investigation note":"जाँच टिप्पणी"}
LABELS_HI={"Cross-case bridge entity":"दूसरे केस से साझा इकाई","Cross-case mention: review required":"दूसरे केस का उल्लेख: समीक्षा आवश्यक","Large transfer: manual review":"बड़ा हस्तांतरण: मानव समीक्षा","Source note connects Vikram, vehicle and Northbridge":"स्रोत टिप्पणी विक्रम, वाहन और नॉर्थब्रिज को जोड़ती है","Synthetic caption: vehicle at Gurugram warehouse":"काल्पनिक विवरण: गुरुग्राम गोदाम में वाहन","CALLED":"कॉल किया","ASSOCIATED_WITH":"संबंधित","LOCATED_AT":"स्थान पर","PAID":"भुगतान","OWNS":"स्वामित्व","MENTIONED_IN":"में उल्लेख","MENTIONED_WITH":"साथ उल्लेख","USES_PHONE":"फ़ोन उपयोग","RECORDED_AT":"स्थान दर्ज","TRANSFERRED_TO":"हस्तांतरण","CAPTIONED_AT":"विवरण में स्थान","COLLECTED":"संग्रहित","HASHED":"हैश किया","ANALYZED":"विश्लेषित","REGISTERED":"ब्लॉकचेन में दर्ज","TRANSFERRED":"सौंपा","RECEIVED":"प्राप्त","REVIEWED":"समीक्षित","SEALED":"सीलबंद","RELEASED":"मुक्त","PERSON":"व्यक्ति","VEHICLE":"वाहन","LOCATION":"स्थान","ACCOUNT":"खाता","CASE":"केस","PHONE":"फ़ोन","analyzed":"विश्लेषित","hashed":"हैश किया","uploaded":"अपलोड किया","registered":"दर्ज"}
REASONS_HI={"Vikram Singh links Vehicle V001 with fictional CASE-X007 through one source note.":"एक स्रोत टिप्पणी विक्रम सिंह, वाहन V001 और काल्पनिक CASE-X007 को जोड़ती है।","A source note mentions Vikram, vehicle and Northbridge together; corroboration is required.":"स्रोत टिप्पणी में विक्रम, वाहन और नॉर्थब्रिज का संयुक्त उल्लेख है; पुष्टि आवश्यक है।"}
def localized(value,locale):
    if locale!="hi":return value
    if " (" in value and value.split(" (",1)[0] in LABELS_HI:
        code,suffix=value.split(" (",1)
        return LABELS_HI[code]+" ("+suffix
    if value.startswith("INR ") and "synthetic demo threshold" in value:
        return value.split(" meets")[0]+" काल्पनिक प्रदर्शन की INR 200,000 सीमा तक पहुँचता है; यह कानूनी मानक या दोष का निर्धारण नहीं है।"
    return NAMES_HI.get(value,LABELS_HI.get(value,REASONS_HI.get(value,value)))
