/**
 * Generated passwords: four random words, e.g. `amber-otter-cloud-mint`.
 * About 600 words give over 9 bits each, 37 bits in all; with the pepper and
 * the sign-in rate limit, that is plenty for a course account and easy to type.
 */

const WORDS = `
able acid acre aged aide aim air alarm album alert alien alley alpha amber
angle ankle apple april apron arch arena arm army arrow art ash atlas atom
attic audio aunt autumn award axis baby bacon badge bag baker ball bamboo
banjo bank barn basil basin batch beach beam bean bear beard bell belt bench
berry bike bird bison blade blank blaze blend block bloom blue board boat
body bolt bone bonus book boot boss bowl box brain branch brass bread brick
bride brook broom brush bucket buddy bulb bunny butter cabin cable cactus
cake camel camp canal candy canoe canvas cape card cargo carpet carrot cart
case cash castle cave cedar cello chair chalk charm chart cheek cheese chef
cherry chess chief chin chip chord cider cinema circle city clam claw clay
cliff clock cloud clover club coach coast cobra cocoa coin comet coral cord
corn cotton couch cow crab crane crate crayon cream creek crow crown cube
cup curve cycle dairy daisy dance dawn deer delta denim desk dial diary
dice dinner disk dock dog doll dolphin domain donkey door dove dragon drama
dream drill drum duck dune dust eagle earth easel echo edge eel egg elbow
elk elm ember empty engine entry equal error essay event exam fabric face
fairy falcon farm feast feather fence ferry fiber field fig film finch fire
fish flag flame flask fleet flint flood floor flour flute foam fog folk
forest fork fossil fox frame frog frost fruit fuel gadget galaxy game garden
garlic gate gecko gem genius ghost giant ginger glass globe glove goat gold
golf goose grain grape graph grass gravel green grid grill guitar gull
habit hammer hand harbor harp hat hawk hazel heart heron hill hinge hippo
hobby honey hood hook horse hotel hound house hug husky ice icon idea igloo
image index ink inlet input iron island ivory jacket jade jaguar jam jar
jazz jelly jet jewel jockey judge juice jungle kayak kettle key kid kite
kitten kiwi knee knife koala label lace ladder lake lamb lamp lark laser
lava lawn leaf lemon lens level lilac lily lime linen lion list llama lobby
lock lodge logic loop lotus lucky lunar lunch lynx magnet mango maple marble
market mask meadow melon menu metal meteor milk mint mirror mist mitten
model monkey moon moose moss motor mouse mud mule muse music nail napkin
navy nest net noble noodle north nose note novel nut oak oasis ocean olive
omega onion opal opera orange orbit orchid otter oven owl ox oyster paddle
page palm panda paper parade park parrot pasta peach peak pear pebble pedal
pencil pepper piano pickle pie pig pilot pine pixel pizza planet plum poem
polar pond pony poppy potato prism puma pumpkin puppy quail quartz queen
quilt rabbit radar radio raft rain ramp ranch raven razor reef rhino ribbon
rice ridge ring river road robin robot rock rocket roof rope rose ruby rug
ruler saddle safari sail salad salmon salt sand satin scarf school scout
sea seal seed shadow shark sheep shell shield ship shoe silk silver singer
siren sketch ski sky sled slope snail snake snow soap sock sofa solar song
soup spark spice spider spoon spring squid stamp star steam stone storm
straw stream sugar summit sun swan sweater table taco tail tango tea teapot
temple tennis tent thumb tiger tile timber toast tomato tooth torch tower
toy track trail train tree tribe trophy truck tulip tuna tunnel turtle
twig umbrella unicorn valley vapor vase velvet violin viper visor volcano
wafer wagon walnut walrus wand wave wax whale wheat wheel whistle willow
window wing winter wizard wolf wool yacht yak yarn yoga zebra zero zinc zone
`
  .trim()
  .split(/\s+/);

/** How many words a generated token has. */
export const TOKEN_WORDS = 4;

export function wordCount(): number {
  return WORDS.length;
}

/** A uniformly random word. */
function randomWord(): string {
  // Draws above the last whole multiple of the word count are redrawn, so
  // every word is equally likely.
  const limit = 65536 - (65536 % WORDS.length);
  const draw = new Uint16Array(1);
  do crypto.getRandomValues(draw);
  while (draw[0] >= limit);
  return WORDS[draw[0] % WORDS.length];
}

/** A new random token of four words, joined by `-`. */
export function generateToken(): string {
  return Array.from({ length: TOKEN_WORDS }, randomWord).join("-");
}
