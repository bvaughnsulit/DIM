/*
is:blue is:haspower -is:maxpower
-is:equipped is:haspower is:incurrentchar
-source:garden -source:lastwish sunsetsafter:arrival
-is:exotic -is:locked -is:maxpower -is:tagged stat:total:<55
(is:weapon is:sniperrifle) or (is:armor modslot:arrival)
(is:weapon and is:sniperrifle) or not (is:armor and modslot:arrival)
-(power:>1000 and -modslot:arrival)
*/

/*
; Lazy BNF diagram of our search grammar
<query> ::= <term> | <term> <term>
<clause> ::= <opt-whitespace> <clause>
<terms> ::= <term> { " " <term>}
<term> ::= <string> | <filter> | <group> | <boolean>
<filter> ::= ["-"]<filterName>:<filterValue>[<operator><number>]
<filterName> ::= <the set of known filter names - is, notes, perks, tag, stat, etc.>
<filterValue> ::= <keyword> | "stat:" <statName> | <string>
<keyword> ::= <the set of known keyword filters - locked, sniperrifle, tagged, etc.>
<statName> ::= <the set of known stat keywords - charge, impact, resilience, etc.>
<operator> ::= "none" | "=" | "<" | "<=" | ">" | ">="
; Numbers are positive only, but don't need to be
<number> ::= DIGIT{DIGIT}
<group> ::= "(" <query> ")"
<boolean> ::= "or" | "not" | "and"
; Strings are basically anything within matching quotes, either single or double
<string> ::= WORD | "\"" WORD {" " WORD} "\"" | "'" WORD {" " WORD} "'\"'"
*/

type Token = [TokenType] | [TokenType, string];

export function parseQuery(query: string) {
  query = query.trim().toLowerCase();

  // http://blog.tatedavies.com/2012/08/28/replace-microsoft-chars-in-javascript/
  query = query.replace(/[\u2018|\u2019|\u201A]/g, "'");
  query = query.replace(/[\u201C|\u201D|\u201E]/g, '"');

  /*
  // \S*?(["']).*?\1 -> match `is:"stuff here"` or `is:'stuff here'`
  // [^\s"']+ -> match is:stuff
  const searchTerms = query.match(/\S*?(["']).*?\1|[^\s"']+/g) || [];
  return searchTerms;
  */

  const tokens: Token[] = [];
  for (const t of lexer(query)) {
    tokens.push(t);
  }
  return tokens;
}

type TokenType = '(' | ')' | 'not' | 'str';

export function* lexer(query: string): Generator<Token> {
  query = query.trim().toLowerCase();

  // http://blog.tatedavies.com/2012/08/28/replace-microsoft-chars-in-javascript/
  query = query.replace(/[\u2018|\u2019|\u201A]/g, "'");
  query = query.replace(/[\u201C|\u201D|\u201E]/g, '"');

  let i = 0;
  while (i < query.length) {
    const char = query[i];

    switch (char) {
      case '(':
      case ')':
        yield [char];
        break;
      case '"':
      case "'":
        {
          const quote = char;
          const remain = query.slice(i + 1);
          const re = new RegExp('(.*?)' + quote, 'g');
          re.lastIndex = i + 1;
          if (re.test(query)) {
            const str = query.slice(i + 1, re.lastIndex - 1);
            console.log(i, remain, str);
            if (str) {
              i += str.length + 1;
              yield ['str', str];
            } else {
              throw new Error('Unterminated quotes: |' + remain + '| ' + i);
            }
          }
        }
        break;
      case '-':
        yield ['not'];
        break;
      case ' ':
        break;
    }

    i++;
  }

  // \S*?(["']).*?\1 -> match `is:"stuff here"` or `is:'stuff here'`
  // [^\s"']+ -> match is:stuff
  //const searchTerms = query.match(/\S*?(["']).*?\1|[^\s"']+/g) || [];
  //return searchTerms;
}
