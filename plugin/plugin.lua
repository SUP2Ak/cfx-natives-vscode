local str_find = string.find
local str_sub = string.sub
local str_gmatch = string.gmatch

-- Fonction de log personnalisée
local function log(...)
    local args = {...}
    local message = ""
    for i, v in ipairs(args) do
        message = message .. tostring(v) .. "\t"
    end
    local file = io.open("C:/Users/SUP2Ak/Desktop/work-supv/self/fivem/supv_native/cfx-natives-vscode/plugin.log", "a")
    if file then
        file:write(message .. "\n")
        file:close()
    end
end

---@param uri string # The uri of file
---@param text string # The content of file
---@return { start: integer, finish: integer, text: string }[] | string | nil
function OnSetText(uri, text)
    if not text then return end -- Protection contre text nil
    
    -- ignore .vscode dir, extension files (i.e. natives), and other meta files
    if str_find(uri, '[\\/]%.vscode[\\/]') or str_sub(text, 1, 8) == '---@meta' then return end

    -- ignore files using fx asset protection
    if str_sub(text, 1, 4) == 'FXAP' then return '' end

    local diffs = {}
    local count = 0

    -- Ajouter un diagnostic disable en haut du fichier
    count = count + 1
    diffs[count] = {
        start = 1,
        finish = 0,
        text = '---@diagnostic disable: malformed-number, unknown-symbol\n'
    }

    	-- prevent diagnostic errors from safe navigation (foo?.bar and foo?[bar])
	for safeNav in str_gmatch(text, '()%?[%.%[]+') do
		count = count + 1
		diffs[count] = {
			start  = safeNav,
			finish = safeNav,
			text   = '',
		}
	end

    -- Gérer la syntaxe raccourcie des objets ({ .name, .age } -> { name = true, age = true })
    local pos = 1
    while pos <= #text do
        local startBrace, endBrace = str_find(text, "{%s*[^}]*}", pos)
        if not startBrace then break end
        
        local body = str_sub(text, startBrace + 1, endBrace - 1)
        local entries = {}
        local modified = false

        -- Traiter les champs avec préfixe "."
        for field in str_gmatch(body, "%.([_%w]+)") do
            table.insert(entries, field .. " = " .. "true")
            modified = true
        end

        if modified then
            count = count + 1
            diffs[count] = {
                start = startBrace - 1,
                finish = endBrace,
                text = "{ " .. table.concat(entries, ", ") .. " }"
            }
        end

        pos = endBrace + 1
    end

    -- Gérer l'opérateur de navigation sécurisée
    for pos in str_gmatch(text, "()%?%.") do
        count = count + 1
        diffs[count] = {
            start = pos,
            finish = pos + 1,
            text = " and "
        }
    end

    return diffs
end