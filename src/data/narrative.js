/**
 * data/narrative.js —— 叙事文案数据
 * ─────────────────────────────────────────────────────────────
 * HUD 与信息面板的全部文案集中于此,与 UI 代码分离,便于校订。
 * 文案原则:短句、克制、用建筑本体说话;避免空洞抒情。
 * 数字一律与 data/pagodaParams.js 同源,改参数时此处同步核对。
 */

export const TITLE = {
  name: '应县木塔',
  formal: '佛宫寺释迦塔',
  era: '辽 清宁二年 · 1056',
  sub: '现存最高最古的全木结构楼阁式塔',
};

const BUDDHA_ASSET_URLS = {
  '01_F1_main_buddha.png': new URL('../../reference/Buddha/images/01_F1_main_buddha.png', import.meta.url).href,
  '05_F2_group.png': new URL('../../reference/Buddha/images/05_F2_group.png', import.meta.url).href,
  '06_F3_group.png': new URL('../../reference/Buddha/images/06_F3_group.png', import.meta.url).href,
  '07_F4_group.png': new URL('../../reference/Buddha/images/07_F4_group.png', import.meta.url).href,
  '08_F5_group.png': new URL('../../reference/Buddha/images/08_F5_group.png', import.meta.url).href,
  '09_all_floors_3d.jpg': new URL('../../reference/Buddha/images/09_all_floors_3d.jpg', import.meta.url).href,
  '11_F1_murals.jpg': new URL('../../reference/Buddha/images/11_F1_murals.jpg', import.meta.url).href,
  '12_F2_groupstudy.jpg': new URL('../../reference/Buddha/images/12_F2_groupstudy.jpg', import.meta.url).href,
  '17_F3_groupstudy.jpg': new URL('../../reference/Buddha/images/17_F3_groupstudy.jpg', import.meta.url).href,
  '20_F4_groupstudy.jpg': new URL('../../reference/Buddha/images/20_F4_groupstudy.jpg', import.meta.url).href,
  '22_F5_groupstudy.jpg': new URL('../../reference/Buddha/images/22_F5_groupstudy.jpg', import.meta.url).href,
  '27_all_floors_ratio.jpg': new URL('../../reference/Buddha/images/27_all_floors_ratio.jpg', import.meta.url).href,
};

const buddhaImage = (file) => BUDDHA_ASSET_URLS[file];

const BUDDHA_IMAGES = {
  all: [
    { src: buddhaImage('09_all_floors_3d.jpg'), alt: '五层室内塑像群垂直关系图', caption: '五层室内塑像群的垂直关系' },
    { src: buddhaImage('27_all_floors_ratio.jpg'), alt: '各层造像比例关系图', caption: '各层造像与室内空间比例' },
  ],
  1: [
    { src: buddhaImage('01_F1_main_buddha.png'), alt: '一层释迦牟尼佛与内槽空间', caption: '一层主尊释迦牟尼佛' },
    { src: buddhaImage('11_F1_murals.jpg'), alt: '一层六铺壁画佛位置与尺度图', caption: '六铺壁画佛与过去七佛格局' },
  ],
  2: [
    { src: buddhaImage('05_F2_group.png'), alt: '二层五尊彩塑群像', caption: '二层中央主佛、胁侍、文殊与普贤' },
    { src: buddhaImage('12_F2_groupstudy.jpg'), alt: '二层塑像群实测与构图分析', caption: '二层塑像群实测构图' },
  ],
  3: [
    { src: buddhaImage('06_F3_group.png'), alt: '三层四方佛群像', caption: '三层四方佛现状总览' },
    { src: buddhaImage('17_F3_groupstudy.jpg'), alt: '三层四方佛构图分析', caption: '四方佛与八角坛构图' },
  ],
  4: [
    { src: buddhaImage('07_F4_group.png'), alt: '四层七尊彩塑群像', caption: '四层释迦说法会现状' },
    { src: buddhaImage('20_F4_groupstudy.jpg'), alt: '四层塑像群现状与构图研究', caption: '四层群像与修复史线索' },
  ],
  5: [
    { src: buddhaImage('08_F5_group.png'), alt: '五层毗卢遮那佛与八菩萨', caption: '五层九尊环列现状' },
    { src: buddhaImage('22_F5_groupstudy.jpg'), alt: '五层九尊曼荼罗构图', caption: '毗卢遮那佛与八菩萨构图' },
  ],
};

/** 逐层导览文案:key 与 states 的 level 对应('all' = 全景) */
export const STOREY_NOTES = {
  all: {
    title: '明五暗四',
    lead: '外观五层六檐,实为九层。',
    body: '五个明层之间各夹一个暗层——外面看是平座栏杆的一圈腰带,'
        + '里面是布满斜撑的结构层。九层叠柱,层层收分,'
        + '67.31 米,不用一颗铁钉。',
    facts: [['总高', '67.31 m'], ['底层对边径', '30.27 m'], ['结构层', '明五 + 暗四']],
  },
  1: {
    title: '首层 · 重檐与厚壁',
    lead: '唯一的重檐:塔身之外周匝一圈副阶。',
    body: '副阶二十四柱撑起最下一檐,把全塔的重量在视觉上向外摊开。'
        + '内外槽双套筒的柱网自此起步,厚砖墙裹住外槽,南北开板门。',
    facts: [['柱高', '8.80 m'], ['外檐铺作', '七铺作双杪双下昂'], ['副阶', '二十四柱']],
  },
  2: {
    title: '二层 · 斜栱与倾斜',
    lead: '补间用六十度斜栱,两缝并出。',
    body: '这一层的斗拱做法最放纵,也正是这一层承受着最严重的现状变形——'
        + '外槽柱向东北方向倾斜,近百年持续发展,是今天木塔保护的核心难题。',
    facts: [['外槽对角径', '24.96 m'], ['铺作', '七铺作,一三跳偷心'], ['明层柱高', '2.86 m']],
  },
  3: {
    title: '三层 · 六铺作',
    lead: '出跳减为三跳,昂改作批竹昂形耍头。',
    body: '自此向上,铺作等级逐层递减:七铺作 → 六铺作 → 五铺作 → 四铺作。'
        + '斗拱的繁简本身就是荷载的读数,越往上,担子越轻。',
    facts: [['铺作', '六铺作出三跳'], ['补间', '四十五度斜栱'], ['檐口标高', '32.41 m']],
  },
  4: {
    title: '四层 · 五铺作双杪',
    lead: '只余两跳华栱,不用昂。',
    body: '塔身收分至此已相当明显。四层与五层的断面尺寸链保存于'
        + '陈明达测绘图版十七,是本模型上部层高的直接依据。',
    facts: [['铺作', '五铺作双杪'], ['出跳', '约 48–50 cm'], ['檐口标高', '41.13 m']],
  },
  5: {
    title: '五层 · 四铺作与塔刹',
    lead: '栌斗上实拍两跳长华栱,替木承檐。',
    body: '顶层斗拱简至极致。屋面攒尖收顶,铁刹自 55.98 米直上 67.31 米:'
        + '砖石刹基坐于攒尖,其上仰莲、覆钵、六道相轮、圆光、仰月、宝珠,'
        + '八条铁链斜拉至屋角。',
    facts: [['铺作', '四铺作级'], ['屋架高', '7.28 m'], ['刹高', '11.33 m']],
  },
};

/** 构件信息卡:拾取命中 userData.partKey 后取用 */
export const PART_INFO = {
  /* —— 大木作 —— */
  column:      { name: '外槽柱', role: '承重', text: '外槽二十四柱,每面三间。柱脚外撇、柱头内收,是为「侧脚」;自当心间向角柱逐柱升高,是为「生起」。两者让整圈柱网像收紧的箍。' },
  innerColumn: { name: '内槽柱', role: '承重', text: '内槽八柱与外槽构成双套筒。内外槽之间以乳栿相连,一层套一层,是这座塔能站一千年的骨架逻辑。' },
  fujieColumn: { name: '副阶柱', role: '承重', text: '首层之外周匝一圈的檐廊柱,撑起最下一檐,把塔身荷载与雨水一并推离墙脚。' },
  anColumn:    { name: '暗层柱', role: '承重', text: '暗层的短柱。上下明层柱不直接对接,而是「叉柱造」插进斗拱层,靠暗层这道刚性腰带把两段接成一体。' },
  plinth:      { name: '柱础', role: '基座', text: '覆盆式石础,隔断地气与潮湿,也把柱脚的集中荷载摊到台基上。' },
  lanE:        { name: '阑额', role: '连接', text: '柱头之间的横向大枋,把一圈柱子箍成整体。随生起而微微起坡,是「柱升」在立面上的痕迹。' },
  pupai:       { name: '普拍枋', role: '连接', text: '压在阑额之上的扁平枋,与阑额成 T 形断面,为斗拱提供连续的坐面。辽宋之际的新做法。' },
  rufu:        { name: '乳栿', role: '承重', text: '内外槽之间的径向大梁。双套筒靠它锁在一起,荷载才能在两圈柱网间传递。' },
  caofu:       { name: '草栿', role: '承重', text: '暗层中不露明的梁,做工从简——反正看不见,力传到就行。' },
  brace:       { name: '暗层斜撑', role: '抗侧力', text: '暗层的交叉斜杆。把只会平行四边形变形的叠柱框架变成刚性桁架,是全塔抗风抗震的关键一层。' },

  /* —— 铺作 —— */
  bracketSet:  { name: '铺作(斗拱)', role: '承挑', text: '斗与栱层层叠出,把屋檐的荷载收拢到柱头。全塔五十余种、四百余朵,由同一套材分规则生成——变的是出跳数与昂的有无。' },
  luDou:       { name: '栌斗', role: '起点', text: '一朵铺作的坐底之斗,方三十二分。所有出跳都从它的十字口里长出来。' },
  jiaoHuDou:   { name: '交互斗', role: '节点', text: '坐在跳头,十字开口,同时卡住出跳的华栱与横置的瓜子栱。' },
  sanDou:      { name: '散斗', role: '节点', text: '横栱两端的小斗,把上一层枋的压力分散到栱身。' },
  qiXinDou:    { name: '齐心斗', role: '节点', text: '横栱正中的小斗,与两端散斗共同承上。' },
  huaGong:     { name: '华栱', role: '出跳', text: '向外挑出的栱,每跳三十分。跳数决定铺作等级——四跳即七铺作。' },
  niDaoGong:   { name: '泥道栱', role: '横向', text: '栌斗口内沿墙面横置的第一道栱,其上叠慢栱、柱头枋,构成铺作的「里」。' },
  guaZiGong:   { name: '瓜子栱', role: '横向', text: '计心跳的跳头横栱。若此跳不置横栱,便称「偷心」——二层的一、三跳正是如此。' },
  manGong:     { name: '慢栱', role: '横向', text: '叠在瓜子栱或泥道栱之上的长栱,九十二分,是横向叠置里最长的一根。' },
  lingGong:    { name: '令栱', role: '横向', text: '最上一跳的横栱,直接承托橑檐枋——屋檐的重量在这里落下。' },
  ang:         { name: '下昂', role: '杠杆', text: '斜置的长杆件:昂身向外下斜、昂尾向内上挑,用杠杆把屋檐挑得更远而不必抬高。昂嘴削作批竹。' },
  shuaTou:     { name: '耍头', role: '收头', text: '铺作最上的出跳构件,伸出令栱之外,断面作蚂蚱头。' },
  tuoFeng:     { name: '驼峰', role: '垫托', text: '补间铺作坐底的驼背形木块,把栌斗垫到与柱头铺作同高。' },
  zhuTouFang:  { name: '柱头枋', role: '连接', text: '铺作里侧层层叠置的横枋,与泥道栱同宽,把一圈铺作串成连续的箍。' },
  liaoYanFang: { name: '橑檐枋', role: '承檐', text: '压在令栱之上的通长枋,檐椽的根部搭在它上面。屋檐的荷载由此汇入斗拱。' },

  /* —— 屋面 —— */
  eave:        { name: '檐口', role: '出檐',
                 text: '檐口不是一条水平直线。它随柱头生起而自当心间向角部微微抬升,'
                     + '再在最后一两个椽档里被生头木一挑而起。'
                     + '所以从任何一个真实视角看过去,平直的那一段都在缓缓下行,'
                     + '临到角部才翻上来——**直檐之「活」,来自生起与透视的合谋**。' },
  roof:        { name: '屋面', role: '围护', text: '八角攒尖檐面。纵剖按「举折」做成凹曲,不是直坡;转角处「起翘」并「冲出」,檐口于是有了那条著名的弧线。' },
  chuan:       { name: '檐椽 / 飞子', role: '出檐', text: '双层出檐:下为圆断面檐椽,上压方断面飞子。檐下那道深影就是它们投出来的。' },
  wangban:     { name: '望板', role: '基层', text: '椽上铺板,板上苫背铺瓦。仰头看到的屋面底,就是这层板。' },
  chuiji:      { name: '垂脊', role: '收缝', text: '沿八条转角线压下的脊,既是装饰,也是两坡瓦面接缝的防水做法。' },
  boji:        { name: '博脊', role: '收缝', text: '屋面与上层塔身相交处的一道横脊,收住这条最容易漏水的缝。' },
  ridgeBeast:  { name: '戗兽', role: '脊饰', text: '垂脊下端的兽形脊饰,压住脊瓦,也镇住檐角。' },
  taoShou:     { name: '套兽', role: '脊饰', text: '套在仔角梁头上的陶件。角梁伸出檐外,断面日晒雨淋最先朽,套兽把这截木头整个罩住——先是护木,才是装饰。' },
  waDang:      { name: '瓦当', role: '瓦作', text: '筒瓦垄末端的堵头,俗称勾头。挡住垄内积水沿椽头倒灌,一垄一颗,把出檐勾成一条线。' },
  daJiaoLiang: { name: '大角梁', role: '大木', text: '转角处斜出的主梁,又称老角梁。翼角的出挑与起翘都由它定,上面再压仔角梁。' },
  ziJiaoLiang: { name: '仔角梁', role: '大木', text: '压在大角梁上的第二根斜梁,比大角梁再出挑一截,梁头戴套兽。翼角的翘起靠这一层加出来。' },

  /* —— 墙身、平座、台基、塔刹 —— */
  wall:        { name: '墙身', role: '围护', text: '柱间填以版壁或抹灰墙;首层为厚砖墙,把外槽整个裹住。暗层的一圈实壁,是「明五暗四」在外观上的读法。' },
  door:        { name: '板门', role: '出入', text: '南北当心间设板门。南门正对月台踏道,是全塔的主入口方向。' },
  window:      { name: '直棂窗', role: '采光', text: '竖棂条构成的窗。虚实相间的窗与实墙,给了立面呼吸的节奏。' },

  /* —— 古今变化:立面材料演变(资料源 reference/FacadeHistory v1.0)—— */
  mudWall:     { name: '夹泥墙', role: '围护 · 古貌', source: '[照] 1902/1927/1934 三帧照片;reference/FacadeHistory',
    text: '木骨之间填泥、外表抹灰,嵌在柱与阑额围出的每一间里。'
      + '「纯木结构」说的是承重体系,不是外立面 —— 二至五层明层原本大量是这样的墙,'
      + '与暗红的木构相间,塔身因此封闭、厚重。1934—1935 年间的一次维修把它们拆了。' },
  wallBrace:   { name: '墙内斜撑', role: '抗侧力 · 古貌', source: '[照/文] 梁思成调查记录;reference/FacadeHistory',
    text: '藏在夹泥墙厚度里的交叉斜杆,自外立面看不见。拆墙时它被一并拆除 ——'
      + '那次改动动的不只是饰面,还有整塔的抗侧刚度体系。今天它没有被复原。' },

  /* —— 牌匾:南立面六方(资料源 reference/plaque v1.0)—— */
  plaqueTianzhu: { name: '「天柱地軸」匾', role: '题名 · 明', source: '[文] 明万历,田蕙题;reference/plaque P-02',
    text: '一层南面。「天柱」「地轴」都是撑住天地的意思——把一座塔说成宇宙的轴,'
      + '这是塔在中国被理解的方式:它不是纪念物,是标定四方的那根杆。' },
  plaqueWangu:  { name: '「萬古觀瞻」匾', role: '题名 · 清', source: '[文] 清康熙六十一年(1722),应州知州章弘;reference/plaque P-01',
    text: '一层南面,与「天柱地軸」上下并挂。康熙末年题——那时塔已站了六百六十六年,'
      + '「万古」二字写下时,它才走完自己寿命的三分之二。'
      + '两方匾孰上孰下,公开资料未定,现按年代早者在上 [估],待 DWG 核。' },
  plaqueTiangong:{ name: '「天宮高聳」匾', role: '题名 · 清', source: '[文] 清光绪十年(1884),地方官题,隶书;reference/plaque P-04',
    text: '二层南面明间。隶书,清代地方官所题。塔身自此层起收分明显,'
      + '仰视时檐口一层比一层近——「高耸」是站在塔下才写得出的两个字。' },
  plaqueShijia: { name: '「釋迦塔」华带牌', role: '题名 · 金', source: '[文] 金明昌五年(1194);主牌 2.65×1.70 m[二手实测];reference/plaque P-05',
    text: '三层南面明间,全塔最重要的一方匾。塔以此得名——它不叫「木塔」,叫釋迦塔。'
      + '金明昌五年题写时,塔已立了一百三十八年;此后八百年,人们都从这三个字认出它。'
      + '形制为华带牌:主牌之上有额首,两侧各一条华带,带上题记。本轮先做简化框板,华带下一轮补。'
      + '题名署读在公开材料中有「王瓛/王瑜」异文,须以拓片或实物再核。' },
  plaqueTianxia:{ name: '「天下奇觀」匾', role: '题名 · 明', source: '[文] 明正德,明武宗朱厚照御题;reference/plaque P-07',
    text: '四层南面明间。正德年间,武宗朱厚照亲征至应州,登塔题此四字。'
      + '彼时塔已四百五十岁,「奇观」既是赞叹,也是一次官方承认:'
      + '它不再只是佛宫寺的一座塔,而是可以拿来标注天下的一件东西。'
      + '两侧另有「金城」「雁塔」两方小匾,绝对方位待测绘图核定,本轮未出件。' },
  plaqueJunji:  { name: '「峻極神工」匾', role: '题名 · 明', source: '[文] 明永乐,传明成祖朱棣题;reference/plaque P-10',
    text: '五层南面明间,全塔最高的一方匾。「峻极」出《中庸》「峻极于天」,说的是高;'
      + '「神工」说的是这高如何被木头做到——全塔无一根铁钉,五十余种斗拱层层收拢。'
      + '常被误写作「峻极神功」,实物与严谨资料均作「工」。'
      + '现匾有后世重制、重挂之说,本模型按现状复原呈现,不声称全为永乐原物。' },
  pingzuo:     { name: '平座', role: '外廊', text: '暗层外挑的一圈楼板,由平座铺作承挑。它是暗层唯一露在外面的部分。' },
  balustrade:  { name: '勾阑', role: '围护', text: '平座外沿的栏杆:望柱、寻杖、盆唇、华板。一圈腰带,把五层塔身分成清晰的段落。' },
  wangZhu:     { name: '望柱', role: '勾阑', text: '勾阑的立柱,按每间等分排布。' },
  xunZhang:    { name: '寻杖', role: '勾阑', text: '勾阑最上的一道横木,手扶之处。' },
  huaBan:      { name: '华板', role: '勾阑', text: '盆唇与地栿之间的板,常作万字或斗子形格心。' },
  platform:    { name: '台基', role: '基座', text: '下层方台、上层八角月台,共高 3.80 米。南、东、西三面设踏道,南面为主。' },
  stair:       { name: '踏道', role: '通行', text: '月台踏步。南面踏道正对塔身当心间的板门。' },

  finial:      { name: '塔刹', role: '收顶', text: '自屋顶攒尖处直上 67.31 米。分段与口径全部照陈明达图版十七的塔刹大样尺寸链,连同坐在攒尖上的砖石刹基。' },
  shaji:       { name: '刹基', role: '基座', text: '砖石叠涩方座,下部埋入屋面攒尖之中。铁刹不是浮在屋顶上的——它是从这座砖基里长出来的。' },
  shazuo:      { name: '刹座(仰莲)', role: '塔刹', text: '铁刹的底座,作仰莲式,坐在屋面攒尖之上。' },
  fubo:        { name: '覆钵', role: '塔刹', text: '倒扣的半球,自印度窣堵坡传来的形制遗存。' },
  xiangLun:    { name: '相轮', role: '塔刹', text: '六道叠涩铁环。相轮的道数是塔的等级标记。' },
  yuanguang:   { name: '圆光', role: '塔刹', text: '穿在刹杆上的扁圆盘,取佛光之象。位于相轮与仰月之间。' },
  yangyue:     { name: '仰月', role: '塔刹', text: '向上开口的月牙形铁件。八条铁链自其下方斜拉至屋角。' },
  baozhu:      { name: '宝珠', role: '塔刹', text: '刹尖的桃形顶珠。全塔的最高点,67.31 米。' },
  gan:         { name: '刹杆', role: '塔刹', text: '贯穿全刹的铁杆,下端深入顶层梁架,是塔刹真正的骨。' },
  chain:       { name: '铁链', role: '抗风', text: '自宝盖斜拉至八个屋角的铁链,拉住塔刹不被风掀。' },
};

const STATUE_FLOOR_INFO = {
  all: {
    name: '五层造像总览',
    role: '游客科普',
    text: '五个明层的内槽都设有塑像,现状共 26 尊:首层 1 尊、二层 5 尊、三层 4 尊、四层 7 尊、五层 9 尊。它们不是简单摆设,而是把木塔组织成一座垂直叠置的佛殿。游客从外槽回廊拾级而上,每到一层都围绕内槽礼佛,建筑空间、佛坛尺度和像设组合彼此咬合。\n\n2021 年测绘论文指出,各层塑像群与室内空间存在清晰比例:首层大佛既是造像模度,也是木塔尺度体系的一部分;三层、五层呈现更强的密教坛场意味。这里的剖透视只展示层级与组合关系,不把抽象模型当作彩塑原貌。',
    facts: [['现存塑像', '26 尊'], ['分层', '1 / 5 / 4 / 7 / 9'], ['空间位置', '五个明层内槽'], ['解读重点', '塔像合一']],
    visual: {
      caption: '图示:五个明层的造像数量沿竖向叠置,剖开一角后可同时看到“外五内九”的结构层与内槽佛殿。',
      levels: [
        { label: '五', count: 9 },
        { label: '四', count: 7 },
        { label: '三', count: 4 },
        { label: '二', count: 5 },
        { label: '一', count: 1 },
      ],
    },
    source: '《建筑史学刊》2021;中国青年网/中国金币网公开介绍',
  },
  1: {
    name: '第一层 · 释迦牟尼与六佛壁画',
    role: '主尊与藻井',
    text: '首层中央为释迦牟尼大佛。通俗介绍常称像高约 11 米,2021 年测绘记录其通高为 10.32 米,净高 8.478 米。大佛坐于须弥仰莲三重座上,上方设斗八藻井,形成从台座到顶部的强烈中轴。\n\n塔心室南、北开门,其余六面墙绘趺坐大佛壁画,与中央释迦牟尼合成“过去七佛”的空间格局。论文还指出,首层层高、大佛通高、壁画六佛顶高之间接近 2:√2:1,说明这里不是随意放置大像,而是围绕主尊尺度设计的礼佛空间。',
    facts: [['主尊', '释迦牟尼佛'], ['通高', '10.32 m / 约 11 m'], ['净高', '8.478 m'], ['壁画', '六佛环绕'], ['比例', '层高:佛高:壁画顶高 ≈ 2:√2:1']],
    visual: {
      caption: '图示:中央大佛独尊,六面壁画环绕;南北开门,上方藻井强化中轴。',
      altar: 'round',
      points: [
        { x: 50, y: 52, r: 12, label: '释迦', kind: 'main' },
        { x: 24, y: 30, r: 4, label: '壁画', kind: 'mural' },
        { x: 50, y: 18, r: 4, label: '壁画', kind: 'mural' },
        { x: 76, y: 30, r: 4, label: '壁画', kind: 'mural' },
        { x: 24, y: 74, r: 4, label: '壁画', kind: 'mural' },
        { x: 50, y: 86, r: 4, label: '壁画', kind: 'mural' },
        { x: 76, y: 74, r: 4, label: '壁画', kind: 'mural' },
      ],
    },
    source: '《建筑史学刊》2021;中国青年网/中国金币网公开介绍',
  },
  2: {
    name: '第二层 · 方坛五尊',
    role: '一佛二菩萨二胁侍',
    text: '二层中央置方形木质佛坛,坛上正中偏北为趺坐主佛,左右后侧立二胁侍菩萨,前侧为文殊、普贤二菩萨。公开介绍提到文殊、普贤可由座下狮、象意象辨识;本模型只保留五尊位置和体量关系。\n\n2021 年测绘给出主佛通高 4.052 米、佛顶高 4.420 米。论文指出二层层高、佛坛面阔和佛顶高接近 10:6:5,而主佛、二胁侍、文殊普贤的通高接近 14:10:9。这一层适合向游客说明“内槽不是空筒,而是被佛坛和塑像尺度精确组织的佛殿”。',
    facts: [['坛座', '方形木坛'], ['组合', '1 佛 + 2 胁侍 + 文殊普贤'], ['主佛通高', '4.052 m'], ['佛顶高', '4.420 m'], ['空间比例', '层高:坛阔:佛顶 ≈ 10:6:5'], ['群像比例', '主佛:胁侍:菩萨 ≈ 14:10:9']],
    visual: {
      caption: '图示:方坛中轴上为主佛,后侧二胁侍,前侧文殊、普贤构成“凸”形组团。',
      altar: 'square',
      points: [
        { x: 50, y: 38, r: 8, label: '佛', kind: 'main' },
        { x: 33, y: 34, r: 5, label: '胁侍', kind: 'standing' },
        { x: 67, y: 34, r: 5, label: '胁侍', kind: 'standing' },
        { x: 35, y: 68, r: 6, label: '文殊', kind: 'side' },
        { x: 65, y: 68, r: 6, label: '普贤', kind: 'side' },
      ],
    },
    source: '《建筑史学刊》2021;中国青年网/中国金币网公开介绍',
  },
  3: {
    name: '第三层 · 八角坛四方佛',
    role: '四方礼佛',
    text: '三层位于五个明层的中部,佛坛为八角形木坛,四尊佛面向东、南、西、北四正方位。2021 年论文将其识读为金刚界四方佛:东方阿閦佛、南方宝生佛、西方阿弥陀佛、北方不空成就佛。\n\n四佛尺度非常接近,平均通高约 2.729 米,顶高约 3.296 米。论文指出各佛高宽比延续 3:2,通高与净高接近 7:5,头身比接近 1:3.5。对游客来说,这一层的重点不是“哪尊更大”,而是八角坛与四向礼佛共同制造出绕行观看的节奏。',
    facts: [['坛座', '八角形木坛'], ['组合', '四方佛'], ['方位', '东阿閦 / 南宝生 / 西阿弥陀 / 北不空成就'], ['平均通高', '约 2.729 m'], ['平均顶高', '约 3.296 m'], ['造型比例', '高宽近 3:2']],
    visual: {
      caption: '图示:八角坛上四佛面向四正方位,观者绕外槽行走时可依次礼拜。',
      altar: 'oct',
      points: [
        { x: 50, y: 24, r: 7, label: '北', kind: 'main' },
        { x: 76, y: 50, r: 7, label: '东', kind: 'main' },
        { x: 50, y: 76, r: 7, label: '南', kind: 'main' },
        { x: 24, y: 50, r: 7, label: '西', kind: 'main' },
      ],
    },
    source: '《建筑史学刊》2021;中国青年网/中国金币网公开介绍',
  },
  4: {
    name: '第四层 · 佛与弟子菩萨',
    role: '最具戏剧性的像设',
    text: '四层现存七尊:中央坐佛,左右为阿难、迦叶二弟子,前侧为文殊、普贤菩萨及二牵兽侍从。梁思成曾称这一层塑像布置为全塔中“最富于戏剧性者”。文殊骑狮、普贤骑象,两组坐骑与侍从形成更强的叙事感。\n\n2021 年论文记录主佛通高 4.274 米、佛顶高 4.710 米,并指出主佛、文殊普贤、弟子、牵兽侍从之间大致呈 12:8:6:3 的高度序列。现状中部分头像、足部和侍从经后代补塑,因此面板以“现状可读关系”科普,不宣称全组皆为辽代原貌。',
    facts: [['组合', '1 佛 + 2 弟子 + 2 菩萨 + 2 侍从'], ['主佛通高', '4.274 m'], ['佛顶高', '4.710 m'], ['群像比例', '约 12:8:6:3'], ['保存状态', '部分后补'], ['主题', '华严法会意象']],
    visual: {
      caption: '图示:中央主佛后列二弟子,前方文殊骑狮、普贤骑象,并有牵兽侍从。',
      altar: 'square',
      points: [
        { x: 50, y: 36, r: 8, label: '佛', kind: 'main' },
        { x: 34, y: 34, r: 4, label: '弟子', kind: 'standing' },
        { x: 66, y: 34, r: 4, label: '弟子', kind: 'standing' },
        { x: 35, y: 65, r: 6, label: '文殊', kind: 'side' },
        { x: 65, y: 65, r: 6, label: '普贤', kind: 'side' },
        { x: 24, y: 60, r: 3, label: '侍', kind: 'attendant' },
        { x: 76, y: 60, r: 3, label: '侍', kind: 'attendant' },
      ],
    },
    source: '《建筑史学刊》2021;中国青年网/中国金币网公开介绍',
  },
  5: {
    name: '第五层 · 毗卢遮那与八菩萨',
    role: '九位曼荼罗意象',
    text: '五层为最高明层,室内高度最低,但佛坛几乎占满内槽。中央为大日如来,亦称毗卢遮那佛,周围四面和四隅环列八尊菩萨,形成九位坛场。论文列出八大菩萨方位:南除盖障、北虚空藏、东金刚手、西观世音、东南文殊、西南地藏、东北普贤、西北弥勒。\n\n2021 年测绘记录中央主佛通高 3.414 米,八菩萨通高平均约 2.008 米,二者接近 5:3。研究者认为这种布置具有佛顶尊胜曼荼罗或九位曼荼罗意象,让塔的最高处从结构收束转入宗教象征的中心。',
    facts: [['主尊', '毗卢遮那佛'], ['组合', '1 佛 + 8 菩萨'], ['主尊通高', '3.414 m'], ['菩萨平均通高', '约 2.008 m'], ['群像比例', '主佛:菩萨 ≈ 5:3'], ['主题', '九位曼荼罗意象']],
    visual: {
      caption: '图示:毗卢遮那佛居中,八菩萨按四正四隅环绕,构成九位坛场。',
      altar: 'square',
      points: [
        { x: 50, y: 50, r: 8, label: '毗卢', kind: 'main' },
        { x: 50, y: 24, r: 4, label: '虚空藏', kind: 'side' },
        { x: 76, y: 50, r: 4, label: '金刚手', kind: 'side' },
        { x: 50, y: 76, r: 4, label: '除盖障', kind: 'side' },
        { x: 24, y: 50, r: 4, label: '观音', kind: 'side' },
        { x: 70, y: 30, r: 4, label: '普贤', kind: 'side' },
        { x: 70, y: 70, r: 4, label: '文殊', kind: 'side' },
        { x: 30, y: 70, r: 4, label: '地藏', kind: 'side' },
        { x: 30, y: 30, r: 4, label: '弥勒', kind: 'side' },
      ],
    },
    source: '《建筑史学刊》2021;中国青年网/中国金币网公开介绍',
  },
};

const STATUE_TYPE_ROLE = {
  buddha: '佛',
  bodhisattva: '菩萨',
  manjushri: '文殊菩萨',
  samantabhadra: '普贤菩萨',
  disciple: '弟子',
  attendant: '侍从',
  mural: '壁画',
};

const STATUE_FLOOR_CARDS = [
  {
    floor: 1,
    title: '一层 · 释迦牟尼佛与过去七佛',
    subtitle: '巨型主尊 · 六铺壁画佛 · 莲座承托力士',
    text: '中央为塔内尺度最大的释迦牟尼佛彩塑,通高 10.32 米,净像高约 8.478 米。背后八角内槽壁面绘六铺坐佛,与中央主尊共同构成“过去七佛”的空间格局。莲座下另有 8 尊承托力士,若计入口径,全塔彩塑数量可由 26 尊扩展为 34 尊。',
    note: '适合向游客说明:进入首层不是只看一尊大佛,而是进入由主尊、壁画佛、供养人与力士共同组织的佛国入口。',
    facts: [['独立主像', '1 尊'], ['主尊通高', '10.32 m'], ['净像高', '8.478 m'], ['壁画佛', '6 铺'], ['统计补充', '力士 8 尊']],
    images: BUDDHA_IMAGES[1],
  },
  {
    floor: 2,
    title: '二层 · 中央主佛与文殊、普贤',
    subtitle: '一佛二立菩萨 · 文殊骑狮 · 普贤骑象',
    text: '方形木坛上,中央主佛略偏北,西北、东北各立一尊胁侍菩萨,前部两侧为文殊菩萨与普贤菩萨。群像形成前低后高、中心突出的三角形秩序。通行介绍常放在华严语境中理解,但主尊手印和尊名仍有讨论,不宜写成无争议定名。',
    note: '适合向游客说明:这一层的价值不只在“佛像有几尊”,更在于尊名、手印、坐骑和方位共同构成的证据链。',
    facts: [['现存造像', '5 尊'], ['主佛通高', '4.052 m'], ['胁侍通高', '2.892 / 2.980 m'], ['文殊/普贤', '2.639 / 2.617 m'], ['学术提示', '主尊尊名有争议']],
    images: BUDDHA_IMAGES[2],
  },
  {
    floor: 3,
    title: '三层 · 八角坛四方佛',
    subtitle: '东阿閦 · 南宝生 · 西阿弥陀 · 北不空成就',
    text: '三层佛坛为八角形木坛,四尊坐佛面向东、南、西、北四正方位。四佛尺度接近,姿态相似而手印不同;莲座下分别以象、马、孔雀、迦楼罗作为方向和佛部象征。观众需要绕行一周,才能依次读出四方佛的空间秩序。',
    note: '适合向游客说明:三层没有唯一正面,它把“环绕观看”变成理解佛像的必要路径。',
    facts: [['现存造像', '4 尊'], ['平均通高', '约 2.729 m'], ['坛座', '八角坛'], ['识别线索', '方位与座下动物'], ['比例', '高宽近 3:2']],
    images: BUDDHA_IMAGES[3],
  },
  {
    floor: 4,
    title: '四层 · 释迦说法会与修复史',
    subtitle: '主佛 · 迦叶阿难 · 文殊普贤 · 二牵兽侍者',
    text: '四层现存七尊:中央通常认定为释迦牟尼佛,西北与东北分立迦叶、阿难,文殊骑狮、普贤骑象分置两侧,座旁各有牵兽侍者。梁思成曾称这一层布置最富戏剧性。现状也最能提示修复史:侍者、头部、下垂足和象鼻等部位包含后世重塑或补修。',
    note: '适合向游客说明:这一层同时展示“说法会”的叙事和“现状不等于原貌”的保护知识。',
    facts: [['现存造像', '7 尊'], ['主佛通高', '4.274 m'], ['弟子', '迦叶 / 阿难'], ['群像比例', '约 12:8:6:3'], ['保存提示', '侍者为现代重塑']],
    images: BUDDHA_IMAGES[4],
  },
  {
    floor: 5,
    title: '五层 · 毗卢遮那佛与八菩萨',
    subtitle: '九尊环列 · 佛顶尊胜曼荼罗意象',
    text: '五层中央为结智拳印的毗卢遮那佛,周围八尊菩萨按四正四隅环列:南除盖障、北虚空藏、东金刚手、西观世音、东南文殊、西南地藏、东北普贤、西北弥勒。研究常将其解释为佛顶尊胜曼荼罗或八大菩萨体系意味。',
    note: '适合向游客说明:抵达最高层后,叙事从具体佛传转向“法界、方向与光”的抽象体验。',
    facts: [['现存造像', '9 尊'], ['主尊', '毗卢遮那佛'], ['主尊通高', '3.414 m'], ['菩萨平均通高', '约 2.008 m'], ['群像比例', '主佛:菩萨 ≈ 5:3']],
    images: BUDDHA_IMAGES[5],
  },
];

STATUE_FLOOR_INFO.all.images = BUDDHA_IMAGES.all;
STATUE_FLOOR_INFO.all.sections = STATUE_FLOOR_CARDS;
for (const card of STATUE_FLOOR_CARDS) {
  if (STATUE_FLOOR_INFO[card.floor]) {
    STATUE_FLOOR_INFO[card.floor].images = card.images;
    STATUE_FLOOR_INFO[card.floor].sections = [card];
  }
}

const EVIDENCE_LABEL = {
  measured: '2021 实测',
  'probable-identification': '可考识别',
  'later-restoration': '含后代补塑',
};

function statueInfoFromMeta(meta = {}) {
  const floor = meta.floor ?? 'all';
  const base = STATUE_FLOOR_INFO[floor] ?? STATUE_FLOOR_INFO.all;
  if (!meta.id) return { ...base, kind: 'statue' };

  const dims = meta.dimensions ?? {};
  const facts = [
    ['楼层', `第 ${floor} 层`],
    ['类别', STATUE_TYPE_ROLE[meta.type] ?? '造像'],
  ];
  if (Number.isFinite(dims.totalHeight)) facts.push(['通高', `${dims.totalHeight.toFixed(3)} m`]);
  if (Number.isFinite(dims.topHeight)) facts.push(['顶高', `${dims.topHeight.toFixed(3)} m`]);
  facts.push(['依据', EVIDENCE_LABEL[meta.evidenceLevel] ?? '资料互证']);

  return {
    name: `${floor === 'all' ? '' : `第${floor}层 · `}${meta.name ?? base.name}`,
    role: STATUE_TYPE_ROLE[meta.type] ?? base.role,
    text: `${base.text}\n\n当前选中: ${meta.name ?? '造像'}。本模型只用抽象体块提示位置、尺度和组合关系,不复原具体面相、手印和彩塑细节。`,
    facts,
    visual: base.visual,
    source: base.source,
    kind: 'statue',
  };
}

export function getPartInfo(key, meta) {
  if (key === 'statueOverview') return { ...STATUE_FLOOR_INFO.all, kind: 'statue' };
  if (key === 'statueFigure' || key === 'statueMural') return statueInfoFromMeta(meta);
  return PART_INFO[key] ?? null;
}

export function hasPartInfo(key) {
  return key === 'statueOverview' || key === 'statueFigure' || key === 'statueMural' || Boolean(PART_INFO[key]);
}

/** 状态名称与提示 */
export const STATE_LABELS = {
  mode: {
    cruise:   { label: '自动巡航', hint: '相机环塔螺旋上升' },
    free:     { label: '自由视角', hint: '拖拽旋转 · 滚轮缩放 · 右键平移' },
    storey:   { label: '逐层导览', hint: '定位到该层 · 可绕塔旋转 · 高度锁定、不可平移' },
    exploded: { label: '结构分解', hint: '沿竖向拉开九个结构层' },
    buildtour: { label: '神游建造', hint: '鸟瞰起始 · 分层建造动画' },
    bracket:  { label: '斗拱特写', hint: '一层外檐转角铺作 · 可分解' },
    statue:   { label: '佛像探索', hint: '剖透视展示 · 佛像层级高亮' },
  },
  time: {
    day:   { label: '昼夜变换', hint: '切换为夜景' },
    night: { label: '昼夜变换', hint: '切换为昼景' },
  },
  /* 古今变化:立面材料演变(reference/FacadeHistory v1.0)。
   * hint 一律带证据等级 —— 资料包 AGENT_USAGE 要求推定与实证在界面上分得开。 */
  era: {
    title:   '古今面貌',
    ancient: { label: '古貌', hint: '古貌 · 1933 拆墙前 —— 二至五层次间夹泥墙,墙内藏斜撑 [照片与文献]' },
    modern:  { label: '今貌', hint: '今貌 · 1935 至今 —— 实墙已拆,通体木面与暗红油饰 [照片与正射影像]' },
  },
  pick: '点击构件查看说明',
};

/** 资料来源署名(与 docs/references.md 保持一致) */
export const CREDITS = {
  title: '资料来源',
  /** 作者署名。与 LICENSE / README / index.html 的 meta 同源,改一处要同步四处。 */
  author: '© 2026 Linpo ZHANG · 保留所有权利',
  authorNote: '源码与程序化生成的几何、纹理、场景归作者所有;'
    + '下列测绘成果与历史图像著作权归原权利人,本项目引用而不再分发。',
  items: [
    '陈明达《应县木塔》,文物出版社 —— 绝对尺寸锚点与全部测绘图版',
    'CAD 矢量平立剖九张 —— 柱网与竖向比例的主力取数源',
    '现代实测二层平面 —— 交叉校核',
    '李诫《营造法式》—— 材分制模数与铺作文法的规则依据',
    'reference/FacadeHistory v1.0 —— 立面材料演变时间线与 1902/1927/1934/2017 图证,'
      + '「古今变化」的全部依据',
  ],
  note: '模型为「基于材分制与实测控制尺寸的参数化规则复原」,'
      + '非测绘实录。所有几何与纹理由代码生成,不含任何外部模型或贴图资产。',
  sourceTags: [
    ['测', '陈明达测绘锚点'],
    ['图', 'CAD 量图 / 书内图版'],
    ['法', '《营造法式》规则推算'],
    ['估', '估算,建造期调优'],
    ['照', '历史照片与正射影像(古今变化)'],
  ],
};

export const HELP = {
  title: '操作说明',
  items: [
    ['拖拽', '旋转视角'],
    ['滚轮 / 双指', '缩放'],
    ['右键拖拽', '平移(逐层导览下关闭 —— 该模式锁定高度)'],
    ['点击构件', '查看构件说明'],
    ['1 – 5', '跳转到对应楼层'],
    ['0', '回到全景'],
    ['空格', '巡航 开 / 关'],
    ['N', '昼夜切换(巡航中按下即从自动昼夜接管)'],
    ['J', '手动推进一季:春 → 夏 → 秋 → 冬'],
    ['X', '结构分解'],
    ['B', '斗拱特写'],
    ['V', '佛像模式'],
    ['G', '古今变化:立面在夹泥墙与木构之间切换'],
    ['P', '复制当前机位链接(报缺陷时贴给开发)'],
    ['L', '构造读图模式:平色体块 + 构件棱线 + 强直射光'],
  ],
  /** 键位之外还需要交代的场景规则 —— 这些不是「按哪个键」,是「它会怎么动」 */
  notes: [
    '自动巡航:相机以恒定角速度环塔,**每半圈换一季**(春 → 夏 → 秋 → 冬,一季约 15 秒)。'
      + '高度是另一条独立轨道,升到刹尖高度再缓降回塔底,全程没有切换,'
      + '所以从塔底到塔顶会跨过好几轮四季。',
    '每一季里白天约占 3/4、夜约占 1/4,黄昏与黎明各有过渡。'
      + '按「昼夜变换」或 N 键即从自动昼夜接管,重新进入巡航时交还。',
    '底栏「四季变化」点一次换一季,点满一圈回到「四季变化(自动)」。'
      + '手动选定某季之后,昼夜也交回按钮。',
    '四季各有其景:春细雨与峰顶残雪,夏最蓝的天、最绿的山与杏花疏影,'
      + '秋是晋北秋色与战乱烽火(圈内起火、圈末随落雪熄灭),冬飘雪与覆雪。',
    '冬季的积雪按**构件朝向**生成:屋面、正脊、栏杆顶面、台阶与月台积雪,'
      + '檐下、斗栱底面与柱身侧面保持干净 —— 迎风面还会被吹蚀得薄一些。',
    '逐层导览:镜头定位到该层后可绕塔旋转与推拉,但**高度锁定、右键平移关闭**,'
      + '保证视线始终平视本层。',
  ],
};
